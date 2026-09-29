"""Kiểm thử đơn vị RBAC: khớp phạm vi phân cấp, danh mục quyền, vai trò hệ thống, Casbin model."""

from pathlib import Path

import casbin
from casbin.util.builtin_operators import key_match_func

from app.rbac import domains
from app.rbac.authz import NO_MATCH, restrict_codes
from app.rbac.permissions import ALL_PERMISSIONS, NON_DELEGATABLE, SYSTEM_ROLES, get_permission

MODEL = str(Path(__file__).resolve().parents[1] / "app" / "rbac" / "model.conf")


def test_domain_matches_hierarchy():
    assert domains.domain_matches("*", "BAOLAC/CB-COBA")
    assert domains.domain_matches("BAOLAC/*", "BAOLAC/CB-COBA")
    assert not domains.domain_matches("BAOLAC/*", "BAOLAM/CB-LYBON")
    assert domains.domain_matches("BAOLAC/CB-COBA", "BAOLAC/CB-COBA")
    assert not domains.domain_matches("BAOLAC/CB-COBA", "BAOLAC/CB-HUNGDAO")
    # phạm vi cụm không khớp yêu cầu toàn tỉnh
    assert not domains.domain_matches("BAOLAC/*", "*")


def test_covers():
    assert domains.covers("*", "BAOLAC/*")
    assert domains.covers("BAOLAC/*", "BAOLAC/CB-COBA")
    assert domains.covers("BAOLAC/*", "BAOLAC/*")
    assert not domains.covers("BAOLAC/*", "*")
    assert not domains.covers("BAOLAC/CB-COBA", "BAOLAC/*")
    assert not domains.covers("BAOLAC/*", "BAOLAM/*")


def test_restrict_codes():
    assert restrict_codes([], None) == []  # toàn tỉnh, không lọc
    assert restrict_codes([], ["A", "B"]) == ["A", "B"]
    assert restrict_codes(["A", "C"], ["A", "B"]) == ["A"]
    assert restrict_codes(["C"], ["A", "B"]) == NO_MATCH
    assert restrict_codes([], []) == NO_MATCH


def test_permission_catalog_and_system_roles_consistent():
    codes = [p.code for p in ALL_PERMISSIONS]
    assert len(codes) == len(set(codes))
    for name, _display, _desc, delegatable, perms in SYSTEM_ROLES:
        for obj, act in perms:
            assert (obj, act) == ("*", "*") or get_permission(f"{obj}.{act}"), f"{name}: {obj}.{act}"
        if name in NON_DELEGATABLE:
            assert not delegatable
    assert "rbac.manage" not in {
        f"{o}.{a}" for o, a in dict((r[0], r[4]) for r in SYSTEM_ROLES)["truong_ban"]
    }


def test_account_managers_hold_every_permission_of_commune_admin():
    """Chống leo thang: người cấp vai trò phải có mọi quyền của vai trò đó. Quản trị tỉnh và chỉ huy cụm tạo tài khoản
    admin xã → thêm quyền mới cho admin_xa thì phải thêm cho cả hai (nếu không: 403 khi tạo admin xã)."""
    roles = {r[0]: set(r[4]) for r in SYSTEM_ROLES}
    for manager in ("admin_tinh", "chi_huy_cum"):
        assert roles["admin_xa"] <= roles[manager], f"{manager} thiếu {roles['admin_xa'] - roles[manager]}"


def _enforcer():
    e = casbin.Enforcer(MODEL)
    e.add_named_domain_matching_func("g", key_match_func)
    for name, *_rest, perms in SYSTEM_ROLES:
        for o, a in perms:
            e.add_policy(name, "*", o, a)
    e.add_grouping_policy("cumbl", "chi_huy_cum", "BAOLAC/*")
    e.add_grouping_policy("xacoba", "can_bo_xa", "BAOLAC/CB-COBA")
    e.add_grouping_policy("lanhdao", "truong_ban", "*")
    return e


def test_casbin_scoped_enforcement():
    e = _enforcer()
    # Chỉ huy cụm: mọi xã trong cụm, không ngoài cụm, không toàn tỉnh
    assert e.enforce("cumbl", "BAOLAC/CB-COBA", "dispatch", "create")
    assert not e.enforce("cumbl", "BAOLAM/CB-LYBON", "dispatch", "create")
    assert not e.enforce("cumbl", "*", "alert", "approve")
    # Cán bộ xã: chỉ trong xã, không điều động
    assert e.enforce("xacoba", "BAOLAC/CB-COBA", "sos", "update")
    assert not e.enforce("xacoba", "BAOLAC/CB-HUNGDAO", "sos", "update")
    assert not e.enforce("xacoba", "BAOLAC/CB-COBA", "dispatch", "create")
    # Lãnh đạo tỉnh: mọi nơi, nhưng không quản trị vai trò
    assert e.enforce("lanhdao", "TPCAOBANG/CB-THUCPHAN", "alert", "approve")
    assert not e.enforce("lanhdao", "*", "rbac", "manage")
