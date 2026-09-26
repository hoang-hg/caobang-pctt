# Tích hợp dữ liệu ngoài: dự báo quốc tế & IoT quan trắc hiện trường

Trang **Nguồn dữ liệu & IoT** (`/nguon-du-lieu`, quyền `integration.view` / `integration.manage`) quản lý mọi nguồn
dữ liệu. Mô hình tham khảo mô-đun “Liên kết ngoài / Connectors” của hệ thống EWS Sơn La.

```
                ┌──────────────────── Nguồn KÉO (backend chủ động gọi theo chu kỳ) ────────────────────┐
Open-Meteo ─────┤ ensemble ECMWF IFS (51) + NOAA GEFS (31) → P10/P50/P90 theo 56 xã → area_forecasts   │
OpenWeather ────┤ One Call 3.0 (cần API key) → area_forecasts (model OPENWEATHER)                      │
                └──────────────────────────────────────────────────────────────────────────────────────┘
                ┌──────────────────── Nguồn ĐẨY (thiết bị / nền tảng gửi vào) ─────────────────────────┐
Thiết bị 4G ────┤ POST /api/v1/ingest/readings   (X-Device-Key riêng từng thiết bị)                    │
Nền tảng hãng ──┤ POST /api/v1/ingest/batch      (Bearer token nguồn IOT_HTTP, ≤ 5000 số đo/lần)       │──► lõi tiếp nhận
Broker MQTT ────┤ topic caobang/pctt/<mã thiết bị>/readings                                           │    (kiểm tra → sensor_readings
ChirpStack/TTN ─┤ POST /api/v1/ingest/lorawan    (Bearer token nguồn LORAWAN)                          │     → WebSocket → cảnh báo tự động)
                └──────────────────────────────────────────────────────────────────────────────────────┘
```

## 1. Dự báo quốc tế

### Open-Meteo (bật mặc định)
- Một lần gọi cho **cả 56 xã** (toạ độ tâm xã): `ensemble-api.open-meteo.com/v1/ensemble`,
  `models=ecmwf_ifs025,gfs025`, `hourly=precipitation`, 72 giờ. Thêm 1 lần gọi dự báo tất định ECMWF lấy nhiệt độ, gió giật.
- Mỗi giờ, mỗi xã tính **P10 / P50 / P90 / trung bình / xác suất mưa ≥ 5 mm/h** cho `ECMWF_ENS`, `GFS_ENS` và
  `BLEND` (gộp 82 thành phần) → bảng `iot_telemetry.area_forecasts`.
- Nowcast 3 giờ của trạm đo mưa (`forecasts` model `QPF-NOWCAST`) lấy P50 kết hợp của xã chứa trạm — bộ mô phỏng
  tự ngừng ghi đè khi nguồn này hoạt động.
- **Kích hoạt từ mô hình dự báo**: xã có tổng mưa 24 giờ tới (P50) ≥ `alert_24h_mm` (mặc định 100 mm) → hệ thống
  tự sinh bản nháp “Chuẩn bị sơ tán” chờ Lãnh đạo phê duyệt (tối đa 1 lần / 12 giờ).
- Chu kỳ mặc định 3 giờ (ECMWF/GEFS cập nhật 4 lần/ngày). Cấu hình JSON:

  ```json
  {"models": ["ecmwf_ifs025", "gfs025"], "forecast_days": 3, "include_deterministic": true,
   "heavy_mm_h": 5.0, "alert_24h_mm": 100.0}
  ```
- **Giấy phép**: gói miễn phí chỉ cho mục đích phi thương mại. Triển khai chính thức nên mua gói có API key —
  nhập key ở “Cấu hình”, hệ thống tự chuyển sang máy chủ `customer-*.open-meteo.com`.

### OpenWeatherMap One Call 3.0 (tắt mặc định)
- Cần API key (1.000 lượt/ngày miễn phí). Mặc định chỉ gọi tại xã có trạm mưa (`targets: rain_stations`, ~10 điểm/giờ).
- Ghi mưa theo giờ vào `area_forecasts` model `OPENWEATHER`.

### Xem dự báo
- Dashboard → “Dự báo mưa 72 giờ theo xã”: dải P10–P90, đường P50 kết hợp, P50 ECMWF và GFS.
- Bản đồ → lớp “Mưa dự báo 24h theo xã”: tô màu 5 cấp theo P50.
- API: `GET /api/v1/forecast/areas?hours=24&model=BLEND`, `GET /api/v1/forecast/areas/{mã xã}`, `GET /api/v1/forecast/models`.

## 2. IoT quan trắc hiện trường

### Đăng ký thiết bị (trang Thiết bị IoT)
Mỗi thiết bị gắn với **một trạm quan trắc**. Giá trị lưu = giá trị gửi × `scale` + `offset_value`
(VD thước nước báo cm so với mốc 180 m: scale 0,01, offset 180). Thiết bị HTTP nhận **khoá riêng chỉ hiện một lần**.

Trạm nhận số đo thật đầu tiên tự chuyển `source = 'iot'` → bộ mô phỏng ngừng sinh dữ liệu cho trạm đó.
Xoá hết thiết bị của trạm → trạm trở lại mô phỏng.

### Gửi dữ liệu

**HTTP (1 thiết bị)**
```bash
curl -X POST https://<máy chủ>/api/v1/ingest/readings \
  -H "Content-Type: application/json" -H "X-Device-Key: cbk_..." \
  -d '{"device_id":"CB-RAIN-TIN-01","value":12.5,"time":"2026-09-26T08:00:00Z"}'
# nhiều số đo (gửi bù khi mất mạng):
  -d '{"device_id":"CB-RAIN-TIN-01","readings":[{"value":3.1,"time":"..."},{"value":4.0,"time":"..."}]}'
```

**HTTP batch (nền tảng IoT của hãng đẩy nhiều thiết bị)**
```bash
curl -X POST https://<máy chủ>/api/v1/ingest/batch -H "Authorization: Bearer cbs_..." \
  -H "Content-Type: application/json" -d '[{"device_id":"A","value":3.2},{"device_id":"B","value":181.4,"time":1790409600}]'
```

**MQTT** — topic `caobang/pctt/<mã thiết bị>/readings`, payload `{"value": 0.42}`, `{"readings": [...]}` hoặc số trần.
```bash
mosquitto_pub -h <broker> -p 1883 -t caobang/pctt/CB-TILT-KCC-01/readings -m '{"value":0.42}'
```

**LoRaWAN** — ChirpStack v4: *Integrations → HTTP*, URL `https://<máy chủ>/api/v1/ingest/lorawan`, header
`Authorization: Bearer cbs_...`. The Things Network v3: *Webhooks* cùng URL/header. Mã thiết bị = **DevEUI**,
giá trị lấy từ trường `value_field` của payload đã giải mã (VD `level_cm`).

`time`: ISO 8601 hoặc epoch (giây / mili-giây); bỏ trống = thời điểm nhận.

### Kiểm tra số đo
| Kiểm tra | Quy tắc |
|---|---|
| Khoảng giá trị | Mưa 0–300 mm/h · Nghiêng ±90° · Độ ẩm 0–100 % · Mực nước BĐ I − 30 m … BĐ III + 30 m |
| Thời gian | Không ở tương lai quá 5 phút, không cũ quá 7 ngày |
| Trùng lặp | Bỏ số đo cùng trạm, cùng thời điểm (thiết bị gửi lại) |
| Mất tín hiệu | Quá 3 × chu kỳ dự kiến không có dữ liệu → thiết bị “mất tín hiệu”, trạm `offline`, ghi nhật ký cảnh báo |

Số đo hợp lệ đi qua **cùng luồng cảnh báo tự động** với dữ liệu mô phỏng: mực nước vượt báo động; cảm biến
nghiêng / độ ẩm đất vượt BĐ II → khoanh vùng nguy cơ 1 km, phiếu SOS nguồn SENSOR, nháp cảnh báo chờ duyệt.

### Bảo mật
- Khoá thiết bị lưu dạng băm SHA-256; token nguồn và API key đối tác mã hoá Fernet (`SECRET_KEY`).
- Log `httpx` bị hạ xuống WARNING để không ghi URL chứa API key.
- **Broker MQTT dev cho phép kết nối ẩn danh** (`mqtt/mosquitto.conf`). Khi triển khai thật: `allow_anonymous false`,
  `password_file`, `acl_file` (mỗi thiết bị chỉ publish topic của mình), bật TLS cổng 8883.
- Đặt cổng `/api/v1/ingest/*` sau API gateway có giới hạn tần suất.

## 3. Giám sát kết nối
Tab **Giám sát kết nối**: số thiết bị trực tuyến / mất tín hiệu, số trạm dùng dữ liệu thật, số đo nhận / bị loại
24 giờ, lỗi đồng bộ, trạng thái broker MQTT và nhật ký tiếp nhận (`integrations.ingest_log`).

## 4. Nguồn trong nước (cần thoả thuận)
VRain (mạng đo mưa), Đài KTTV Cao Bằng / Cục KTTV (mực nước, bản tin), dữ liệu vận hành hồ chứa, Viện Địa công nghệ
và Môi trường (cảnh báo sạt lở theo xã — `apitruotlo.canhbaothientai.org.vn` hiện chưa có API công khai). Khi có
thoả thuận: nếu đối tác **đẩy** dữ liệu → dùng `/ingest/batch`; nếu cung cấp API để **kéo** → viết adapter mới trong
`backend/app/integrations/adapters/` (mẫu: `openweather.py`) và thêm vào `ADAPTERS` của `runner.py`.

## 5. Kiểm thử
```bash
docker compose exec backend pytest -q tests/test_integrations.py   # phân vị tổ hợp, kiểm tra số đo, LoRaWAN/MQTT
node scripts/iot-test.mjs                                            # 22 kịch bản HTTP / batch / LoRaWAN / MQTT
```
