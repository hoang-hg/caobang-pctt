# RBAC — Phân quyền theo vai trò và phạm vi địa bàn

Hệ thống dùng **Casbin `rbac_with_domains`** giống `thientai-org-backend`, nhưng phạm vi (domain) là **địa bàn phân cấp
của tỉnh Cao Bằng** thay vì tên tỉnh.

## 1. Khái niệm

| Thuật ngữ | Ý nghĩa | Ví dụ |
|---|---|---|
| **Quyền** (`obj.act`) | Một hành động trên một loại tài nguyên | `sos.update`, `alert.approve` |
| **Vai trò** | Tập quyền, lưu dạng policy `p, role, *, obj, act` | `chi_huy_cum` |
| **Phạm vi** (domain) | Nơi vai trò có hiệu lực | `*` · `BAOLAC/*` · `BAOLAC/CB-COBA` |
| **Phân quyền** | Gán vai trò cho tài khoản tại một phạm vi: `g, user, role, domain` | `g, chihuy.baolac, chi_huy_cum, BAOLAC/*` |

### Phạm vi phân cấp

```
*                          Toàn tỉnh Cao Bằng
├── BAOLAC/*               Cụm Bảo Lạc (địa bàn huyện cũ, 8 xã)
│   ├── BAOLAC/CB-COBA     Xã Cô Ba
│   └── BAOLAC/CB-HUNGDAO  Xã Hưng Đạo …
├── TPCAOBANG/*            Cụm TP. Cao Bằng (3 phường)
└── …                      10 cụm = 10 địa bàn huyện/thành phố trước 01/07/2025
```

Mỗi xã có cột `spatial_admin.administrative_units.rbac_domain`. Casbin dùng `key_match` cho domain của `g`,
nên phân quyền ở `BAOLAC/*` khớp mọi yêu cầu có domain `BAOLAC/CB-...`; phân quyền ở `*` khớp mọi nơi.
Yêu cầu ở phạm vi toàn tỉnh (`*`) **không** khớp phân quyền cấp cụm/xã — quyền “toàn tỉnh” (VD `hotline.operate`)
chỉ có hiệu lực khi được cấp ở `*`.

## 2. Danh mục quyền (SSOT: `backend/app/rbac/permissions.py`)

| Quyền | Theo phạm vi | Mô tả |
|---|---|---|
| `monitoring.view` | ✓ | Dashboard, bản đồ, số liệu quan trắc |
| `sos.view` / `sos.create` / `sos.update` / `sos.resolve` | ✓ | Xem / tiếp nhận / chuyển trạng thái / xác nhận đã cứu phiếu SOS |
| `dispatch.create` | ✓ | Phát lệnh điều động (theo xã của điểm SOS; được điều lực lượng ngoài xã) |
| `resource.view` | ✓ | Lực lượng, kho, phương tiện, điểm sơ tán |
| `inventory.issue` | ✓ | Ra lệnh xuất kho (theo xã của kho) |
| `vehicle.update` | ✓ | Đổi trạng thái phương tiện (theo xã của đơn vị quản lý) |
| `alert.view` / `alert.create` / `alert.approve` | ✓ | Xem / soạn (Maker) / phê duyệt (Checker) lệnh cảnh báo — phải có quyền trên **tất cả** xã nhận tin |
| `contact.view` | ✓ | Danh bạ (cấp tỉnh luôn hiển thị, cấp xã/thôn theo phạm vi) |
| `hotline.operate` | toàn tỉnh | Tổng đài, phân luồng cuộc gọi IVR |
| `audit.view` | toàn tỉnh | Nhật ký pháp lý |
| `user.view` / `user.manage` | ✓ | Xem / tạo tài khoản con, cấp – thu hồi vai trò trong phạm vi |
| `report.view` / `report.moderate` | ✓ | Xem / duyệt – từ chối – đánh dấu đã xử lý – chuyển SOS phản ánh của người dân |
| `rbac.manage` | toàn tỉnh | Tạo / sửa / xoá định nghĩa vai trò |

## 3. Vai trò hệ thống (seed mỗi lần khởi động)

| Vai trò | Uỷ quyền được | Quyền chính |
|---|---|---|
| `super_admin` Quản trị hệ thống | ✗ | Tất cả (`*.*`) |
| `admin_tinh` Quản trị tỉnh | ✗ | Quản lý tài khoản & duyệt phản ánh toàn tỉnh; xem giám sát, SOS, nguồn lực, cảnh báo, nhật ký, nguồn dữ liệu. **Không** điều động, không soạn/duyệt cảnh báo, không sửa vai trò |
| `admin_xa` Quản trị xã | ✓ | Quản lý tài khoản & duyệt phản ánh trong xã; tiếp nhận – cập nhật SOS của xã |
| `truong_ban` Lãnh đạo BCH | ✗ | Tất cả trừ `rbac.manage` |
| `chi_huy_cum` Chỉ huy cụm | ✓ | Điều hành, xuất kho, soạn + duyệt cảnh báo, quản lý tài khoản trong cụm |
| `truc_ban` Trực ban điều hành | ✓ | Tiếp nhận SOS, điều động, soạn cảnh báo (Maker), tổng đài |
| `can_bo_xa` Cán bộ PCTT xã | ✓ | Tiếp nhận & cập nhật SOS, xem nguồn lực trong xã |
| `thu_kho` Thủ kho | ✓ | Xem & xuất kho |
| `quan_sat` Quan sát | ✓ | Chỉ xem |

Vai trò tuỳ chỉnh do `super_admin` tạo ở trang **Phân quyền → Vai trò & quyền**.

## 4. Uỷ quyền & chống leo thang (`app/rbac/management.py::assert_can_delegate`)

1. `super_admin` cấp được mọi vai trò ở mọi phạm vi.
2. Người khác chỉ cấp vai trò có cờ **uỷ quyền được** và không phải `super_admin` / `truong_ban` / `admin_tinh`.
   Như vậy chuỗi quản trị là **super admin → admin tỉnh → admin xã → cán bộ**: admin tỉnh tạo admin xã ở bất kỳ xã nào,
   admin xã chỉ tạo tài khoản trong xã mình và không tự nâng quyền được.
3. Phạm vi cấp phải nằm trong phạm vi `user.manage` của người cấp (chỉ huy cụm Bảo Lạc không cấp cho cụm khác).
4. **Không leo thang**: mọi quyền của vai trò được cấp, người cấp phải đang có ở phạm vi đó
   (VD chỉ huy cụm không cấp được `truc_ban` vì thiếu `hotline.operate`).
5. Không sửa / khoá được tài khoản có vai trò ngoài phạm vi mình, không tự khoá mình.

Mỗi lần cấp/thu hồi quyền, đổi mật khẩu hoặc khoá tài khoản, `users.token_version` tăng → JWT cũ bị từ chối (401),
người dùng đăng nhập lại để nhận quyền mới. Mọi thao tác ghi vào `communications.rbac_audit_log`.

## 5. Dùng trong code

**Backend** (`app/rbac/authz.py`):

```python
# Kiểm tra trên một tài nguyên cụ thể (scope loader đọc xã của phiếu)
@router.patch("/sos/{ticket_id}")
async def update_sos(ticket_id: str, user=Depends(require_permission("sos", "update", scope_loaders.sos_ticket))): ...

# Danh sách: giao vùng người dùng lọc với phạm vi được phép → mã xã cho area_clause()
@router.get("/sos")
async def list_sos(codes: list[str] = Depends(area_scope("sos", "view"))): ...

# Cần quyền ở ít nhất một phạm vi, rồi kiểm tra chi tiết trong thân hàm
user = Depends(require_any("dispatch", "create"));  can(user, "dispatch", "create", domain)
```

Quy tắc: **không** kiểm tra tên vai trò trong route; thêm quyền mới vào `permissions.py` + bảng ở tài liệu này.

**Frontend** (`src/rbac/`): `/auth/me` trả `permissions: [{obj, act, dom}]`.

```jsx
<Can I="dispatch" a="create" scope={ticket.admin_code}><button>Điều phối</button></Can>
const canIssue = usePermission('inventory', 'issue', warehouse.admin_code);
const codes = useAllowedCodes('monitoring', 'view'); // null = toàn tỉnh
```

Giao diện chỉ ẩn/hiện — backend mới là nơi chặn thật. WebSocket nhận token (`/ws?token=`) và chỉ đẩy sự kiện SOS /
nhật ký thuộc xã trong phạm vi người dùng.

## 6. API quản trị (`/api/v1/rbac`)

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET | `/permissions`, `/roles` | `user.view` (bất kỳ phạm vi) |
| GET | `/scopes` | đã đăng nhập |
| POST / PATCH / DELETE | `/roles`, `/roles/{name}` | `rbac.manage` |
| GET / POST | `/users` | `user.view` / `user.manage` (lọc theo phạm vi) |
| PATCH | `/users/{id}` | `user.manage` + quản lý được tài khoản đó |
| POST / DELETE | `/users/{id}/assignments` | `user.manage` + rào chắn uỷ quyền |
| GET | `/audit` | `user.view` (chỉ thao tác trong phạm vi) |

## 7. Kiểm thử

```bash
docker compose exec backend pytest -q tests/test_rbac.py   # khớp phạm vi, Casbin model, danh mục quyền
node scripts/rbac-test.mjs                                  # 46 kịch bản qua API (cần stack đang chạy)
```

## 8. Vận hành

- Backend chạy 1 worker nên policy Casbin nằm trong bộ nhớ một tiến trình. Khi chạy nhiều worker, thêm Redis watcher
  như `thientai-org-backend` (`app/core/rbac/redis_watcher.py`).
- Tài khoản demo và vai trò của chúng khai báo ở `backend/app/seed_data.py::USERS`; chỉ được gán nếu tài khoản
  chưa có vai trò nào (không ghi đè thay đổi của quản trị viên).
