"""Bộ mô phỏng thời gian thực (thay cho luồng IoT / GPS / Zalo thật khi demo).

Mỗi nhịp (tick):
  1. Sinh số đo cho mọi trạm theo kịch bản → reading.new
  2. Kiểm tra ngưỡng: cảm biến nghiêng/độ ẩm đất vượt BĐ II → tự khoanh vùng nguy hiểm, tạo phiếu SENSOR
     và bản nháp cảnh báo chờ Lãnh đạo phê duyệt; dự báo mực nước 3h tới vượt BĐ III → nháp "Chuẩn bị sơ tán"
  3. Vận hành hồ chứa theo lưu lượng về
  4. Di chuyển lực lượng theo lộ trình lệnh điều động → gps.update
  5. Thỉnh thoảng sinh SOS từ người dân (Zalo/App/Hotline) → sos.new
  6. Mô phỏng giao nhận tin cảnh báo đang phát → broadcast.updated
  7. Tiêu hao vật tư, tiến độ sơ tán → inventory.changed
"""

import asyncio
import json
import logging
import random
from datetime import UTC, datetime, timedelta

from app import seed_data as D
from app.config import settings
from app.db import execute, fetch_all, fetch_one, transaction
from app.services import scenario
from app.services.broadcast import advance_delivery, estimate_audience, fill_template
from app.services.events import log_event
from app.services.sos import create_ticket
from app.ws.hub import hub

log = logging.getLogger(__name__)
rng = random.Random()

STATION_PARAMS = {s[0]: (s[2], s[9], s[8], s[1]) for s in D.STATIONS}  # id → (type, params, thresholds, name)
DEMO_SPEEDUP = 20  # lực lượng di chuyển nhanh gấp 20 lần thực tế để thấy rõ trên bản đồ
LEVEL_NAMES = {1: "I", 2: "II", 3: "III"}


def alarm_level(value: float, thr: dict) -> int:
    level = 0
    for i, key in enumerate(("bd1", "bd2", "bd3"), start=1):
        if key in thr and value >= thr[key]:
            level = i
    return level


class Simulator:
    def __init__(self) -> None:
        self.tick = 0
        self.anchor: datetime | None = None
        self.wl_levels: dict[str, int] = {}
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        await asyncio.sleep(2)
        while True:
            try:
                await self.step()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("simulator tick failed")
            await asyncio.sleep(settings.simulator_tick_seconds)

    async def _anchor(self) -> datetime:
        if self.anchor is None:
            row = await fetch_one(
                "SELECT value #>> '{}' AS v FROM operations.system_settings WHERE key = 'scenario_anchor'"
            )
            self.anchor = datetime.fromisoformat(row["v"]) if row else datetime.now(UTC)
        return self.anchor

    def t_rel(self, now: datetime) -> float:
        return (now - self.anchor).total_seconds() / 3600

    async def step(self) -> None:
        self.tick += 1
        now = datetime.now(UTC)
        await self._anchor()
        readings = await self.readings(now)
        await self.check_triggers(readings, now)
        if self.tick % 5 == 1:
            await self.reservoirs(readings)
        await self.move_dispatches()
        if self.tick % settings.simulator_sos_every_ticks == 0:
            await self.random_sos()
        await self.deliveries()
        if self.tick % 8 == 0:
            await self.consume_inventory()
        if self.tick % 15 == 0:
            await self.forecast_trigger(now)
        if self.tick % 225 == 0:  # ~15 phút: làm mới dự báo & dọn dữ liệu cũ
            await self.refresh_forecasts(now)
            await execute("DELETE FROM iot_telemetry.sensor_readings WHERE time < now() - interval '10 days'")

    # 1 ---------------------------------------------------------------
    async def readings(self, now: datetime) -> list[dict]:
        """Chỉ sinh số đo cho trạm còn ở chế độ mô phỏng (trạm đã có thiết bị IoT thật thì bỏ qua)."""
        t = self.t_rel(now)
        out = []
        simulated = {
            r["id"]
            for r in await fetch_all(
                "SELECT id FROM iot_telemetry.monitoring_stations WHERE source = 'simulator'"
            )
        }
        for sid, (stype, params, thr, _name) in STATION_PARAMS.items():
            if sid not in simulated:
                continue
            noise = {
                "luong_mua": rng.uniform(-0.8, 0.8),
                "muc_nuoc": rng.uniform(-0.02, 0.02),
                "do_nghieng": rng.uniform(-0.01, 0.015),
                "do_am_dat": rng.uniform(-0.3, 0.3),
            }[stype]
            value = scenario.value_for(stype, params, t, noise)
            out.append(
                {
                    "station_id": sid,
                    "type": stype,
                    "value": value,
                    "time": now,
                    "level": alarm_level(value, thr),
                }
            )
        if not out:
            return out
        async with transaction() as conn:
            await conn.exec_driver_sql(
                "INSERT INTO iot_telemetry.sensor_readings (time, station_id, value) VALUES (%(time)s, %(station_id)s, %(value)s)",
                [{"time": r["time"], "station_id": r["station_id"], "value": r["value"]} for r in out],
            )
        await hub.publish("reading.new", out)
        return out

    # 2 ---------------------------------------------------------------
    async def check_triggers(self, readings: list[dict], now: datetime) -> None:
        for r in readings:
            sid, stype, value, level = r["station_id"], r["type"], r["value"], r["level"]
            # Số đo từ IoT thật mang sẵn ngưỡng/tên trạm; số đo mô phỏng lấy từ STATION_PARAMS
            thr = r.get("thresholds") or STATION_PARAMS.get(sid, (None, None, {}, sid))[2]
            name = r.get("name") or STATION_PARAMS.get(sid, (None, None, {}, sid))[3]
            if stype == "muc_nuoc":
                # Trễ (hysteresis) 0,15 m: không báo lặp khi mực nước dao động quanh vạch báo động
                prev = self.wl_levels.get(sid)
                if prev is None:
                    self.wl_levels[sid] = level
                elif level > prev:
                    await log_event(
                        f"{name}: mực nước {value:.2f} m, vượt Báo động {LEVEL_NAMES[level]}",
                        "canh_bao",
                        "danger" if level >= 2 else "warning",
                    )
                    self.wl_levels[sid] = level
                elif level < prev and value < thr[f"bd{prev}"] - 0.15:
                    self.wl_levels[sid] = level
            elif stype in ("do_nghieng", "do_am_dat") and level >= 2:
                await self.sensor_hotspot(sid, name, value, level, thr, stype)

    async def sensor_hotspot(
        self, sid: str, name: str, value: float, level: int, thr: dict, stype: str = "do_nghieng"
    ) -> None:
        active = await fetch_one(
            "SELECT id FROM iot_telemetry.hazard_zones WHERE station_id = :s AND valid_until > now()",
            {"s": sid},
        )
        if active:
            return
        st = await fetch_one(
            """SELECT s.admin_unit_id, u.name AS commune, u.code, ST_Y(s.location) AS lat, ST_X(s.location) AS lon
                 FROM iot_telemetry.monitoring_stations s JOIN spatial_admin.administrative_units u ON u.id = s.admin_unit_id
                WHERE s.id = :s""",
            {"s": sid},
        )
        zone_level = "do" if level >= 3 else "cam"
        zone = await fetch_one(
            """INSERT INTO iot_telemetry.hazard_zones (type, level, name, source, station_id, admin_unit_id, valid_until, geom)
               VALUES ('sat_lo', :l, :n, 'sensor', :s, :a, now() + interval '12 hours',
                       ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 1000)::geometry))
               RETURNING id, type, level, name, ST_AsGeoJSON(geom)::json AS geom""",
            {
                "l": zone_level,
                "n": f"Vùng nguy cơ sạt lở tự động – {name}",
                "s": sid,
                "a": st["admin_unit_id"],
                "lat": st["lat"],
                "lon": st["lon"],
            },
        )
        await hub.publish("hazard.new", zone)
        unit = "°" if stype == "do_nghieng" else "%"
        await log_event(
            f"TỰ ĐỘNG: {name} đạt {value}{unit} (vượt BĐ {LEVEL_NAMES[level]}) – khoanh vùng nguy cơ sạt lở bán kính 1 km",
            "canh_bao",
            "danger",
            st["admin_unit_id"],
            st["lat"],
            st["lon"],
        )
        await create_ticket(
            raw_message=None,
            source="SENSOR",
            lat=st["lat"],
            lon=st["lon"],
            incident_type="sat_lo",
            priority=1 if level >= 3 else 2,
            trapped_count=0,
            address=f"{name} ({st['commune']})",
            notes=f"Phiếu tự động từ trạm {sid}: giá trị {value}{unit}, ngưỡng {thr}",
        )
        site = await fetch_one(
            """SELECT name FROM resources.evacuation_sites
                ORDER BY location <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 1""",
            {"lat": st["lat"], "lon": st["lon"]},
        )
        rain = await fetch_one(
            """SELECT COALESCE(round(sum(v)), 0) AS mm FROM (
                 SELECT avg(value) AS v FROM iot_telemetry.sensor_readings
                  WHERE station_id = (SELECT id FROM iot_telemetry.monitoring_stations WHERE type = 'luong_mua'
                                       ORDER BY location <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 1)
                    AND time > now() - interval '72 hours'
                  GROUP BY time_bucket('1 hour', time)) h""",
            {"lat": st["lat"], "lon": st["lon"]},
        )
        tpl = await fetch_one("SELECT body FROM communications.message_templates WHERE code = 'SAT_LO'")
        await self.auto_draft(
            title=f"[Tự động] Di dời khẩn cấp – {name}",
            template="SAT_LO",
            body=fill_template(
                tpl["body"],
                {
                    "dia_diem": f"khu vực {name.split('–')[-1].strip()}, xã {st['commune']}",
                    "luong_mua": str(int(rain["mm"])),
                    "diem_so_tan": site["name"],
                    "thoi_gian": (datetime.now(UTC) + timedelta(hours=9)).strftime("%Hh%M"),
                },
            ),
            severity="do",
            polygon=zone["geom"],
            codes=[st["code"]],
            channels=["CELL_BROADCAST", "SMS", "ZALO_OA", "LOA"],
            trigger=f"sensor:{sid}",
        )

    async def auto_draft(self, *, title, template, body, severity, polygon, codes, channels, trigger) -> None:
        audience = await estimate_audience(codes, polygon)
        row = await fetch_one(
            """INSERT INTO communications.alert_broadcasts (title, message_body, template_code, severity, target_admin_codes, target_polygon,
                     channels, status, auto_generated, trigger_source, audience)
               VALUES (:t, :b, :tpl, :s, :codes,
                       CASE WHEN CAST(:poly AS text) IS NULL THEN
                            (SELECT ST_Multi(ST_Union(geom)) FROM spatial_admin.administrative_units WHERE code = ANY(:codes))
                       ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:poly AS text)), 4326)) END,
                       :ch, 'pending_approval', TRUE, :trg, CAST(:aud AS jsonb))
               RETURNING id, code, title, status""",
            {
                "t": title,
                "b": body,
                "tpl": template,
                "s": severity,
                "codes": codes,
                "poly": json.dumps(polygon) if polygon else None,
                "ch": channels,
                "trg": trigger,
                "aud": json.dumps(audience),
            },
        )
        await execute(
            """INSERT INTO communications.audit_logs (actor_name, action, entity, entity_id, details)
               VALUES ('Hệ thống (Edge AI)', 'broadcast.auto_draft', 'alert_broadcast', :c, CAST(:d AS jsonb))""",
            {"c": row["code"], "d": json.dumps({"trigger": trigger, "title": title}, ensure_ascii=False)},
        )
        await hub.publish("broadcast.updated", row)
        await log_event(
            f"Bản nháp cảnh báo {row['code']} chờ Lãnh đạo phê duyệt: {title}", "canh_bao", "warning"
        )

    async def forecast_trigger(self, now: datetime) -> None:
        rows = await fetch_all(
            """SELECT s.id, s.name, s.river, s.alarm_thresholds AS thr, u.name AS commune, u.code, max(f.value) AS peak
                 FROM iot_telemetry.forecasts f
                 JOIN iot_telemetry.monitoring_stations s ON s.id = f.station_id
                 JOIN spatial_admin.administrative_units u ON u.id = s.admin_unit_id
                WHERE f.model = 'HEC-HMS' AND f.time BETWEEN now() AND now() + interval '3 hours'
                GROUP BY s.id, s.name, s.river, s.alarm_thresholds, u.name, u.code"""
        )
        for r in rows:
            if r["peak"] < r["thr"].get("bd3", 1e9):
                continue
            recent = await fetch_one(
                """SELECT 1 FROM communications.alert_broadcasts WHERE trigger_source = :t AND created_at > now() - interval '12 hours'""",
                {"t": f"forecast:{r['id']}"},
            )
            if recent:
                continue
            tpl = await fetch_one(
                "SELECT body FROM communications.message_templates WHERE code = 'CHUAN_BI_SO_TAN'"
            )
            preset = next(
                (p for p in D.PRESETS if D.unit_code(r["commune"]) in [D.unit_code(n) for n in p[4]]), None
            )
            codes = (
                [D.unit_code(n) for n in preset[4]]
                if preset and preset[0] == "LV_BANG_GIANG"
                else [r["code"]]
            )
            await self.auto_draft(
                title=f"[Dự báo] Chuẩn bị sơ tán – lũ sông {r['river']} vượt BĐ III trong 3 giờ tới",
                template="CHUAN_BI_SO_TAN",
                body=fill_template(
                    tpl["body"],
                    {
                        "so_gio": "3",
                        "dia_diem": f"ven sông {r['river']}",
                        "nguy_co": f"lũ vượt Báo động III ({r['peak']:.2f} m tại {r['name']})",
                    },
                ),
                severity="cam",
                polygon=None,
                codes=codes,
                channels=["SMS", "ZALO_OA", "PUSH", "LOA"],
                trigger=f"forecast:{r['id']}",
            )

    async def refresh_forecasts(self, now: datetime) -> None:
        base = now.replace(minute=0, second=0, microsecond=0)
        # Nguồn dự báo thật (Open-Meteo) còn hoạt động → không ghi đè nowcast mưa bằng kịch bản
        real_qpf = await fetch_one(
            """SELECT 1 FROM integrations.data_sources WHERE type = 'open_meteo' AND enabled
                  AND last_success_at > now() - interval '6 hours' LIMIT 1"""
        )
        async with transaction() as conn:
            for sid, (stype, params, _, _) in STATION_PARAMS.items():
                if stype not in ("muc_nuoc", "luong_mua") or (stype == "luong_mua" and real_qpf):
                    continue
                horizon, model = (24, "HEC-HMS") if stype == "muc_nuoc" else (3, "QPF-NOWCAST")
                await execute(
                    "DELETE FROM iot_telemetry.forecasts WHERE station_id = :s AND model = :m",
                    {"s": sid, "m": model},
                    conn,
                )
                for h in range(1, horizon + 1):
                    ts = base + timedelta(hours=h)
                    await execute(
                        "INSERT INTO iot_telemetry.forecasts (station_id, time, value, model, issued_at) VALUES (:s, :t, :v, :m, now())",
                        {
                            "s": sid,
                            "t": ts,
                            "v": scenario.value_for(stype, params, self.t_rel(ts)),
                            "m": model,
                        },
                        conn,
                    )

    # 3 ---------------------------------------------------------------
    async def reservoirs(self, readings: list[dict]) -> None:
        rain = {r["station_id"]: r["value"] for r in readings if r["type"] == "luong_mua"}
        basin = {
            "Gâm": ["CB-RN-04", "CB-RN-05"],
            "Neo": ["CB-RN-04"],
            "Bằng Giang": ["CB-RN-01", "CB-RN-02"],
            "Suối Khuổi Lái": ["CB-RN-01"],
        }
        res = await fetch_all("SELECT * FROM iot_telemetry.reservoirs")
        for r in res:
            stations = basin.get(r["river"], ["CB-RN-01"])
            intensity = sum(rain.get(s, 0) for s in stations) / len(stations)
            inflow = round(max(60, 120 + intensity * 38 + rng.uniform(-25, 25)))
            level = r["current_level"] + (inflow - r["outflow_m3s"]) / 25000
            gates = r["spill_gates_open"]
            if level > r["normal_level"] - 0.3 and gates < r["spill_gates"]:
                gates += 1
            elif level < r["normal_level"] - 1.2 and gates > 0:
                gates -= 1
            outflow = round(inflow * 0.55 + gates * 180)
            await execute(
                """UPDATE iot_telemetry.reservoirs SET inflow_m3s = :i, outflow_m3s = :o, current_level = :l, spill_gates_open = :g,
                          updated_at = now() WHERE id = :id""",
                {
                    "i": inflow,
                    "o": outflow,
                    "l": round(min(level, r["normal_level"] + 0.4), 2),
                    "g": gates,
                    "id": r["id"],
                },
            )
            if gates != r["spill_gates_open"]:
                verb = "mở thêm" if gates > r["spill_gates_open"] else "đóng bớt"
                await log_event(
                    f"{r['name']} {verb} cửa xả: {gates}/{r['spill_gates']} cửa, lưu lượng xả {outflow} m³/s",
                    "van_hanh",
                    "warning" if gates > r["spill_gates_open"] else "info",
                    r["admin_unit_id"],
                )

    # 4 ---------------------------------------------------------------
    async def move_dispatches(self) -> None:
        orders = await fetch_all(
            """SELECT o.id, o.ticket_id, o.force_id, o.vehicle_ids, o.progress, o.distance_km, t.code AS ticket_code, f.name AS force_name
                 FROM operations.dispatch_orders o
                 JOIN operations.sos_tickets t ON t.id = o.ticket_id
                 LEFT JOIN resources.forces f ON f.id = o.force_id
                WHERE o.status = 'dang_di'"""
        )
        updates = []
        for o in orders:
            km_per_tick = 35 * DEMO_SPEEDUP * settings.simulator_tick_seconds / 3600
            progress = min(1.0, o["progress"] + km_per_tick / max(o["distance_km"] or 1, 0.5))
            arrived = progress >= 1.0
            async with transaction() as conn:
                pos = await fetch_one(
                    """UPDATE operations.dispatch_orders SET progress = :p, status = CASE WHEN :arr THEN 'da_den' ELSE status END
                        WHERE id = :id
                    RETURNING ST_Y(ST_LineInterpolatePoint(route_geom, :p)) AS lat, ST_X(ST_LineInterpolatePoint(route_geom, :p)) AS lon""",
                    {"p": progress, "arr": arrived, "id": o["id"]},
                    conn,
                )
                await execute(
                    "UPDATE resources.forces SET location = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), updated_at = now() WHERE id = :f",
                    {**pos, "f": o["force_id"]},
                    conn,
                )
                await execute(
                    """UPDATE resources.vehicles SET current_location = ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), updated_at = now(),
                              fuel_level = GREATEST(5, fuel_level - CASE WHEN random() < 0.15 THEN 1 ELSE 0 END)
                        WHERE id = ANY(:v)""",
                    {**pos, "v": o["vehicle_ids"]},
                    conn,
                )
            updates.append(
                {
                    "dispatch_id": o["id"],
                    "ticket_id": o["ticket_id"],
                    "force_id": o["force_id"],
                    "vehicle_ids": o["vehicle_ids"],
                    "lat": pos["lat"],
                    "lon": pos["lon"],
                    "progress": progress,
                }
            )
            if arrived:
                await log_event(
                    f"{o['force_name']} đã tiếp cận hiện trường {o['ticket_code']}",
                    "cuu_ho",
                    "info",
                    lat=pos["lat"],
                    lon=pos["lon"],
                )
                await hub.publish(
                    "dispatch.updated",
                    {"dispatch_id": o["id"], "ticket_id": o["ticket_id"], "status": "da_den"},
                )
        if updates:
            await hub.publish("gps.update", updates)

    # 5 ---------------------------------------------------------------
    async def random_sos(self) -> None:
        source, msg = rng.choice(D.SOS_MESSAGES)
        await create_ticket(
            raw_message=msg,
            source=source,
            reporter_name="Người dân (mô phỏng)",
            reporter_phone=f"{D.DEMO_PHONE_PREFIX} {rng.randint(100, 999)} {rng.randint(100, 999)}",
        )

    # 6 ---------------------------------------------------------------
    async def deliveries(self) -> None:
        rows = await fetch_all(
            "SELECT id, code, metrics FROM communications.alert_broadcasts WHERE status = 'sending'"
        )
        for r in rows:
            metrics, done = advance_delivery(r["metrics"], rng)
            await execute(
                """UPDATE communications.alert_broadcasts SET metrics = CAST(:m AS jsonb),
                          status = CASE WHEN :d THEN 'sent' ELSE status END,
                          sent_at = CASE WHEN :d THEN now() ELSE sent_at END WHERE id = :id""",
                {"m": json.dumps(metrics), "d": done, "id": r["id"]},
            )
            await hub.publish(
                "broadcast.updated",
                {
                    "id": r["id"],
                    "code": r["code"],
                    "metrics": metrics,
                    "status": "sent" if done else "sending",
                },
            )
            if done:
                await log_event(f"Hoàn tất phát tin {r['code']} trên {len(metrics)} kênh", "canh_bao", "info")

    # 7 ---------------------------------------------------------------
    async def consume_inventory(self) -> None:
        row = await fetch_one(
            """UPDATE resources.inventory SET quantity = GREATEST(0, quantity - (1 + floor(random() * 6))::int), last_updated = now()
                WHERE (warehouse_id, item_code) = (SELECT warehouse_id, item_code FROM resources.inventory
                                                    WHERE item_code IN ('MI_TOM','NUOC_CHAI','LUONG_KHO','AO_PHAO','TUI_SO_CUU')
                                                    ORDER BY random() LIMIT 1)
            RETURNING warehouse_id, item_code, quantity, safety_quota"""
        )
        await execute(
            """UPDATE operations.evacuation_progress
                  SET evacuated_households = LEAST(planned_households, evacuated_households + 1),
                      evacuated_persons = LEAST(planned_persons, evacuated_persons + 4), updated_at = now()
                WHERE admin_unit_id = (SELECT admin_unit_id FROM operations.evacuation_progress
                                        WHERE evacuated_households < planned_households ORDER BY random() LIMIT 1)"""
        )
        if row:
            await hub.publish("inventory.changed", row)


simulator = Simulator()
