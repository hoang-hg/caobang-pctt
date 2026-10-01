"""Kiểm thử đơn vị RBAC: khớp phạm vi, danh mục quyền, 3 vai trò theo cấp, chuyển vai trò cũ, Casbin model."""

from pathlib import Path

import casbin
from casbin.util.builtin_operators import key_match_func

from app.rbac import domains
from app.rbac.authz import NO_MATCH, restrict_codes
from app.rbac.permissions import (
    ALL_PERMISSIONS,
    COMMUNE_ROLE,
    NO_LEVEL,
    PROVINCE_ROLE,
    RETIRED_ROLES,
    ROLE_LEVEL,
    SUPER_ADMIN_ROLE,
    SYSTEM_ROLES,
    get_permission,
    level_of,
    scope_fits,
)
from app.rbac.seed import plan_role_cleanup

MODEL = str(Path(__file__).resolve().parents[1] / "app" / "rbac" / "model.conf")
COMMUNES = {"BAOLAC/CB-COBA", "BAOLAC/CB-HUNGDAO", "TPCAOBANG/CB-THUCPHAN"}


def test_domain_matches_hierarchy():
    assert domains.domain_matches("*", "BAOLAC/CB-COBA")
    assert domains.domain_matches("BAOLAC/CB-COBA", "BAOLAC/CB-COBA")
    assert not domains.domain_matches("BAOLAC/CB-COBA", "BAOLAC/CB-HUNGDAO")
    assert not domains.domain_matches("BAOLAC/CB-COBA", "*")


def test_covers():
    assert domains.covers("*", "BAOLAC/CB-COBA")
    assert domains.covers("BAOLAC/CB-COBA", "BAOLAC/CB-COBA")
    assert not domains.covers("BAOLAC/CB-COBA", "*")
    assert not domains.covers("BAOLAC/CB-COBA", "BAOLAC/CB-HUNGDAO")


def test_restrict_codes():
    assert restrict_codes([], None) == []  # toàn tỉnh, không lọc
    assert restrict_codes([], ["A", "B"]) == ["A", "B"]
    assert restrict_codes(["A", "C"], ["A", "B"]) == ["A"]
    assert restrict_codes(["C"], ["A", "B"]) == NO_MATCH
    assert restrict_codes([], []) == NO_MATCH


def test_one_role_per_level():
    """Đúng 3 vai trò, mỗi cấp 1 vai trò; quyền của cấp dưới là tập con của cấp trên (cấp trên tạo được tài khoản cấp
    dưới mà không vướng rào chắn chống leo thang)."""
    assert [r[0] for r in SYSTEM_ROLES] == [SUPER_ADMIN_ROLE, PROVINCE_ROLE, COMMUNE_ROLE]
    assert sorted(ROLE_LEVEL.values()) == [1, 2, 3]
    codes = [p.code for p in ALL_PERMISSIONS]
    assert len(codes) == len(set(codes))
    roles = {r[0]: {f"{o}.{a}" for o, a in r[4]} for r in SYSTEM_ROLES}
    for name, perms in roles.items():
        for code in perms:
            assert code == "*.*" or get_permission(code), f"{name}: {code}"
    assert roles[COMMUNE_ROLE] <= roles[PROVINCE_ROLE], roles[COMMUNE_ROLE] - roles[PROVINCE_ROLE]
    assert roles[PROVINCE_ROLE] == set(codes)  # mọi tài khoản cấp tỉnh làm được mọi việc cấp tỉnh
    # Cấp 3: không quản lý tài khoản, không duyệt / soạn cảnh báo, không điều động, không nhập thẳng dữ liệu
    for code in (
        "user.view",
        "user.manage",
        "alert.create",
        "alert.approve",
        "dispatch.create",
        "data.import",
    ):
        assert code not in roles[COMMUNE_ROLE], code
    # chỉ Cấp 3 được cấp trên (không phải Cấp 1) cấp
    assert [r[0] for r in SYSTEM_ROLES if r[3]] == [COMMUNE_ROLE]


def test_scope_fits_level():
    assert scope_fits(SUPER_ADMIN_ROLE, "*") and scope_fits(PROVINCE_ROLE, "*")
    assert not scope_fits(PROVINCE_ROLE, "BAOLAC/CB-COBA")
    assert scope_fits(COMMUNE_ROLE, "BAOLAC/CB-COBA")
    assert not scope_fits(COMMUNE_ROLE, "*")
    assert not scope_fits(COMMUNE_ROLE, "BAOLAC/*")  # không còn phạm vi cụm
    assert not scope_fits("chi_huy_cum", "BAOLAC/*")
    assert level_of([COMMUNE_ROLE, PROVINCE_ROLE]) == 2
    assert level_of([]) == NO_LEVEL and level_of(["thu_kho"]) == NO_LEVEL


def test_plan_role_cleanup_maps_retired_roles():
    groups = [
        ("admin", SUPER_ADMIN_ROLE, "*"),  # giữ nguyên
        ("lanhdao", "truong_ban", "*"),  # → Quản trị tỉnh
        ("trucban", "truc_ban", "*"),
        ("canbo", "can_bo_xa", "BAOLAC/CB-COBA"),  # → Quản trị xã cùng xã
        ("cum", "chi_huy_cum", "BAOLAC/*"),  # bỏ cụm → khoá
        ("kho", "thu_kho", "*"),  # bỏ → khoá (không tự nâng thành Quản trị tỉnh)
        ("xem", "quan_sat", "*"),
        ("tuychinh", "vai_tro_tu_tao", "*"),  # vai trò tuỳ chỉnh → khoá
        ("hai", "can_bo_xa", "BAOLAC/CB-COBA"),  # nhiều vai trò → giữ cấp cao nhất
        ("hai", "truc_ban", "*"),
        ("haixa", COMMUNE_ROLE, "TPCAOBANG/CB-THUCPHAN"),  # 2 xã → giữ 1
        ("haixa", COMMUNE_ROLE, "BAOLAC/CB-COBA"),
        ("xacum", COMMUNE_ROLE, "BAOLAC/*"),  # Quản trị xã cấp theo cụm → sai phạm vi → khoá
        ("xamat", COMMUNE_ROLE, "BAOLAC/CB-KHONGCO"),  # xã không tồn tại
    ]
    plan = plan_role_cleanup(groups, lambda d: d in COMMUNES)
    after: dict[str, set] = {}
    for u, r, d in groups:
        after.setdefault(u, set()).add((r, d))
    for u, r, d in plan.remove:
        after[u].remove((r, d))
    for u, r, d in plan.add:
        after[u].add((r, d))
    assert after["admin"] == {(SUPER_ADMIN_ROLE, "*")}
    assert after["lanhdao"] == {(PROVINCE_ROLE, "*")} and after["trucban"] == {(PROVINCE_ROLE, "*")}
    assert after["canbo"] == {(COMMUNE_ROLE, "BAOLAC/CB-COBA")}
    assert after["hai"] == {(PROVINCE_ROLE, "*")}
    assert len(after["haixa"]) == 1
    for u in ("cum", "kho", "xem", "tuychinh", "xacum", "xamat"):
        assert after[u] == set(), u
    assert sorted(plan.lock) == ["cum", "kho", "tuychinh", "xacum", "xamat", "xem"]
    assert all(len(v) <= 1 for v in after.values())  # mỗi tài khoản tối đa 1 vai trò
    # Đã đúng mô hình → không thay đổi gì (chạy mỗi lần khởi động)
    clean = [(u, r, d) for u, v in after.items() for r, d in v]
    again = plan_role_cleanup(clean, lambda d: d in COMMUNES)
    assert not (again.remove or again.add or again.lock)
    assert set(RETIRED_ROLES) == {"truong_ban", "truc_ban", "can_bo_xa", "chi_huy_cum", "thu_kho", "quan_sat"}


def _enforcer():
    e = casbin.Enforcer(MODEL)
    e.add_named_domain_matching_func("g", key_match_func)
    for name, *_rest, perms in SYSTEM_ROLES:
        for o, a in perms:
            e.add_policy(name, "*", o, a)
    e.add_grouping_policy("tinh", PROVINCE_ROLE, "*")
    e.add_grouping_policy("xacoba", COMMUNE_ROLE, "BAOLAC/CB-COBA")
    return e


def test_casbin_scoped_enforcement():
    e = _enforcer()
    # Cấp 2: mọi nơi, kể cả duyệt cảnh báo, tổng đài, quản lý tài khoản
    assert e.enforce("tinh", "TPCAOBANG/CB-THUCPHAN", "alert", "approve")
    assert e.enforce("tinh", "*", "hotline", "operate")
    assert e.enforce("tinh", "BAOLAC/CB-COBA", "user", "manage")
    # Cấp 3: chỉ trong xã, không điều động, không quản lý tài khoản
    assert e.enforce("xacoba", "BAOLAC/CB-COBA", "sos", "update")
    assert e.enforce("xacoba", "BAOLAC/CB-COBA", "inventory", "issue")  # kho của xã
    assert not e.enforce("xacoba", "*", "inventory", "issue")  # kho tỉnh
    assert not e.enforce("xacoba", "BAOLAC/CB-HUNGDAO", "sos", "update")
    assert not e.enforce("xacoba", "BAOLAC/CB-COBA", "dispatch", "create")
    assert not e.enforce("xacoba", "BAOLAC/CB-COBA", "user", "manage")
