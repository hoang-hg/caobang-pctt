"""Phạm vi (domain) RBAC theo địa bàn Cao Bằng.

    "*"                 toàn tỉnh — vai trò Cấp 1, Cấp 2
    "<CUM>/<MA_XA>"     một xã/phường (VD "BAOLAC/CB-COBA") — vai trò Cấp 3
    "<CUM>/*"           một cụm (địa bàn huyện cũ) — KHÔNG còn cấp vai trò theo cụm; mẫu này chỉ còn trong nhật ký cũ

Danh sách đơn vị (56 xã) được nạp một lần vào bộ nhớ.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.db import fetch_all
from app.rbac.permissions import GLOBAL_SCOPE


@dataclass(frozen=True, slots=True)
class Unit:
    id: str
    code: str
    name: str
    district: str
    domain: str

    @property
    def cluster(self) -> str:
        return self.domain.split("/", 1)[0]


_units: list[Unit] = []


async def load_units(force: bool = False) -> list[Unit]:
    global _units
    if _units and not force:
        return _units
    rows = await fetch_all(
        """SELECT id::text AS id, code, name, old_district, rbac_domain FROM spatial_admin.administrative_units
            WHERE level = 'xa' AND rbac_domain IS NOT NULL ORDER BY old_district, name"""
    )
    _units = [Unit(r["id"], r["code"], r["name"], r["old_district"], r["rbac_domain"]) for r in rows]
    return _units


def units() -> list[Unit]:
    return _units


def domain_matches(pattern: str, domain: str) -> bool:
    """Casbin key_match: pattern có thể kết thúc bằng '*'."""
    i = pattern.find("*")
    if i == -1:
        return pattern == domain
    return domain[:i] == pattern[:i] if len(domain) > i else domain == pattern[:i]


def covers(outer: str, inner: str) -> bool:
    """Phạm vi ``outer`` có bao trùm phạm vi ``inner`` (cũng có thể là mẫu cụm) không."""
    if outer == GLOBAL_SCOPE:
        return True
    if inner == GLOBAL_SCOPE:
        return False
    if outer.endswith("/*"):
        return inner.startswith(outer[:-1])
    return outer == inner


def domain_of_code(code: str | None) -> str | None:
    if not code or code == "CB":
        return GLOBAL_SCOPE
    return next((u.domain for u in _units if u.code == code), None)


def domain_of_unit_id(unit_id) -> str:
    if unit_id is None:
        return GLOBAL_SCOPE
    uid = str(unit_id)
    return next((u.domain for u in _units if u.id == uid), GLOBAL_SCOPE)


def code_of_unit_id(unit_id) -> str | None:
    uid = str(unit_id) if unit_id is not None else None
    return next((u.code for u in _units if u.id == uid), None)


def codes_for_patterns(patterns: list[str]) -> list[str]:
    return sorted({u.code for u in _units for p in patterns if domain_matches(p, u.domain)})


def is_valid_domain(domain: str) -> bool:
    if domain == GLOBAL_SCOPE:
        return True
    if domain.endswith("/*"):
        return any(u.cluster == domain[:-2] for u in _units)
    return any(u.domain == domain for u in _units)


def label(domain: str) -> str:
    if domain == GLOBAL_SCOPE:
        return "Toàn tỉnh Cao Bằng"
    if domain.endswith("/*"):
        u = next((u for u in _units if u.cluster == domain[:-2]), None)
        return f"Cụm {u.district}" if u else domain
    u = next((u for u in _units if u.domain == domain), None)
    return f"{u.name} ({u.district})" if u else domain


def scope_tree() -> dict:
    """Phạm vi cấp được: toàn tỉnh (Cấp 1–2) và từng xã/phường (Cấp 3)."""
    return {
        "province": {"domain": GLOBAL_SCOPE, "label": "Toàn tỉnh Cao Bằng"},
        "communes": [
            {"domain": u.domain, "code": u.code, "label": u.name, "district": u.district} for u in _units
        ],
    }
