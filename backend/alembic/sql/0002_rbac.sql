-- =====================================================================
-- RBAC theo phạm vi địa bàn (Casbin rbac_with_domains)
--   domain = "*"                      toàn tỉnh
--          = "<CUM>/*"                cả cụm (địa bàn huyện cũ), VD "BAOLAC/*"
--          = "<CUM>/<MA_XA>"          một xã/phường, VD "BAOLAC/CB-COBA"
-- =====================================================================

-- Bảng policy của Casbin (khớp model của casbin-async-sqlalchemy-adapter)
CREATE TABLE IF NOT EXISTS public.casbin_rule (
  id    serial PRIMARY KEY,
  ptype varchar(255),
  v0    varchar(255),
  v1    varchar(255),
  v2    varchar(255),
  v3    varchar(255),
  v4    varchar(255),
  v5    varchar(255)
);
CREATE INDEX IF NOT EXISTS casbin_rule_ptype_v0 ON public.casbin_rule (ptype, v0);

-- Metadata vai trò (tên hiển thị tiếng Việt, cờ hệ thống / được phép uỷ quyền)
CREATE TABLE communications.rbac_role_metadata (
  name           text PRIMARY KEY,
  display_name   text NOT NULL,
  description    text,
  is_system      boolean NOT NULL DEFAULT false,
  is_delegatable boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Nhật ký cấp / thu hồi quyền
CREATE TABLE communications.rbac_audit_log (
  id          bigserial PRIMARY KEY,
  time        timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_name  text,
  action      text NOT NULL,   -- role.create | role.update | role.delete | grant | revoke | user.create | user.update
  target_user text,
  role        text,
  domain      text,
  details     jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ON communications.rbac_audit_log (time DESC);

-- Người dùng: bỏ vai trò cố định, thêm token_version (thu hồi JWT khi đổi quyền), trạng thái
ALTER TABLE communications.users DROP COLUMN IF EXISTS role;
ALTER TABLE communications.users ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0;
ALTER TABLE communications.users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE communications.users ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES communications.users(id);
ALTER TABLE communications.users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Domain RBAC cho từng đơn vị hành chính
ALTER TABLE spatial_admin.administrative_units ADD COLUMN IF NOT EXISTS rbac_domain text;
UPDATE spatial_admin.administrative_units
   SET rbac_domain = CASE
     WHEN level = 'tinh' THEN '*'
     WHEN level = 'xa' THEN regexp_replace(upper(spatial_admin.norm(old_district)), '[^A-Z0-9]', '', 'g') || '/' || code
   END
 WHERE level IN ('tinh', 'xa');
CREATE INDEX ON spatial_admin.administrative_units (rbac_domain);
