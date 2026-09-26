"""Kiểm thử đơn vị tích hợp dữ liệu: phân vị tổ hợp Open-Meteo, kiểm tra số đo IoT, định dạng LoRaWAN/MQTT."""

from datetime import UTC, datetime, timedelta

from app.api.v1.ingest import parse_lorawan
from app.integrations import crypto
from app.integrations.adapters.open_meteo import parse_deterministic, parse_ensemble, quantile
from app.integrations.adapters.openweather import parse_onecall
from app.integrations.ingest import normalize, parse_time, value_range
from app.integrations.mqtt_bridge import device_from_topic, parse_payload

NOW = datetime(2026, 9, 26, 8, 0, tzinfo=UTC)


def _ensemble_location():
    # 2 giờ; ECMWF 3 thành phần, GEFS 2 thành phần
    return {
        "hourly": {
            "time": ["2026-09-26T09:00", "2026-09-26T10:00"],
            "precipitation_ecmwf_ifs025_ensemble": [0.0, 10.0],
            "precipitation_member01_ecmwf_ifs025_ensemble": [1.0, 20.0],
            "precipitation_member02_ecmwf_ifs025_ensemble": [2.0, 30.0],
            "precipitation_ncep_gefs025": [4.0, 0.0],
            "precipitation_member01_ncep_gefs025": [None, 2.0],
        }
    }


def test_quantile_interpolates():
    assert quantile([0, 10], 0.5) == 5
    assert quantile([1, 2, 3], 0.1) == 1.2
    assert quantile([], 0.5) == 0.0


def test_parse_ensemble_models_and_blend():
    rows = parse_ensemble(_ensemble_location(), heavy=5.0)
    by = {(r["model"], r["time"].hour): r for r in rows}
    ec = by[("ECMWF_ENS", 10)]
    assert ec["members"] == 3 and ec["precip_p50"] == 20.0 and ec["prob_heavy"] == 1.0
    gfs9 = by[("GFS_ENS", 9)]
    assert gfs9["members"] == 1  # bỏ giá trị null
    blend = by[("BLEND", 10)]
    assert blend["members"] == 5
    assert blend["precip_p10"] <= blend["precip_p50"] <= blend["precip_p90"]
    assert blend["prob_heavy"] == 0.6
    assert by[("BLEND", 9)]["time"] == datetime(2026, 9, 26, 9, 0, tzinfo=UTC)


def test_parse_deterministic_prefers_ecmwf():
    loc = {
        "hourly": {
            "time": ["2026-09-26T09:00"],
            "temperature_2m_ecmwf_ifs025": [24.5],
            "wind_gusts_10m_ecmwf_ifs025": [40.0],
            "temperature_2m_gfs_seamless": [99],
        }
    }
    out = parse_deterministic(loc)
    assert out[datetime(2026, 9, 26, 9, 0, tzinfo=UTC)] == {"temp_c": 24.5, "gust_kmh": 40.0}


def test_parse_onecall():
    rows = parse_onecall(
        {
            "hourly": [
                {"dt": 1790409600, "temp": 23.1, "wind_gust": 10, "pop": 0.8, "rain": {"1h": 3.2}},
                {"dt": 1790413200, "temp": 22.0},
            ]
        }
    )
    assert rows[0]["precip"] == 3.2 and rows[0]["gust_kmh"] == 36.0
    assert rows[1]["precip"] == 0.0 and rows[1]["gust_kmh"] is None


def test_value_ranges():
    assert value_range("luong_mua", {}) == (0.0, 300.0)
    assert value_range("muc_nuoc", {"bd1": 180, "bd3": 182}) == (150.0, 212.0)


def test_normalize_validates_and_scales():
    device = {"scale": 0.1, "offset_value": 0}
    station = {"type": "luong_mua", "thresholds": {}}
    items = [
        {"value": 125},  # 12.5 mm/h, thời điểm = now
        {"value": 50, "time": (NOW - timedelta(minutes=10)).isoformat()},
        {"value": -5},  # âm → loại
        {"value": 10, "time": (NOW + timedelta(hours=1)).isoformat()},  # tương lai → loại
        {"value": 10, "time": (NOW - timedelta(days=8)).isoformat()},  # quá cũ → loại
        {"value": None},
        {"value": True},
    ]
    good, errors = normalize(items, device, station, NOW)
    assert [g["value"] for g in good] == [12.5, 5.0]
    assert good[0]["time"] == NOW
    assert len(errors) == 5


def test_parse_time_formats():
    assert parse_time("2026-09-26T08:00:00Z", NOW) == NOW
    assert parse_time(1790409600, NOW) == datetime.fromtimestamp(1790409600, UTC)
    assert parse_time(1790409600000, NOW) == datetime.fromtimestamp(1790409600, UTC)
    assert parse_time(None, NOW) == NOW


def test_parse_lorawan_chirpstack_and_ttn():
    cs = {
        "deviceInfo": {"devEui": "a84041000181c061"},
        "time": "2026-09-26T08:00:00Z",
        "object": {"rain": 3.5},
    }
    assert parse_lorawan(cs) == ("a84041000181c061", {"rain": 3.5}, "2026-09-26T08:00:00Z")
    ttn = {
        "end_device_ids": {"dev_eui": "70B3D57ED0000001"},
        "uplink_message": {"decoded_payload": {"tilt": 0.4}, "received_at": "2026-09-26T08:00:00Z"},
    }
    assert parse_lorawan(ttn) == ("70B3D57ED0000001", {"tilt": 0.4}, "2026-09-26T08:00:00Z")
    assert parse_lorawan({"foo": 1})[0] is None


def test_mqtt_topic_and_payload():
    assert device_from_topic("caobang/pctt/DEV-01/readings", "caobang/pctt/+/readings") == "DEV-01"
    assert device_from_topic("caobang/other/DEV-01/readings", "caobang/pctt/+/readings") is None
    assert parse_payload(b'{"value": 1.5}') == [{"value": 1.5}]
    assert parse_payload(b'{"readings": [{"value": 1}, {"value": 2}]}') == [{"value": 1}, {"value": 2}]
    assert parse_payload(b"3.2") == [{"value": 3.2}]


def test_crypto_roundtrip_and_device_key():
    assert crypto.decrypt(crypto.encrypt("api-key-123")) == "api-key-123"
    assert crypto.decrypt("khong-hop-le") is None
    key = crypto.new_device_key()
    assert key.startswith("cbk_") and crypto.key_matches(key, crypto.hash_key(key))
    assert not crypto.key_matches("sai", crypto.hash_key(key))
