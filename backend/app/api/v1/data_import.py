"""Nhập dữ liệu chính thức từ tệp: /api/v1/data-import/* (README §2.4).

- Quyền ``data.import`` (toàn tỉnh): nhập thẳng. Hai bước: /validate (không ghi gì, trả lỗi theo dòng) → /apply
  (kiểm tra lại rồi ghi trong 1 transaction).
- Quyền ``data.submit`` (theo xã): /validate giới hạn trong xã mình → POST /submissions lưu hồ sơ CHỜ DUYỆT, chưa ghi
  gì vào dữ liệu nghiệp vụ (không hiện ở đâu). Cấp tỉnh xem những gì sẽ ghi (/submissions/{id}: kiểm tra lại với dữ
  liệu hiện tại, giá trị cũ → mới), phê duyệt (ghi + đổi trạng thái trong 1 transaction, khoá hồ sơ → 2 người bấm cùng
  lúc chỉ ghi 1 lần) hoặc từ chối kèm lý do. Người gửi không tự duyệt; được rút hồ sơ đang chờ.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.auth import audit, current_user
from app.config import settings
from app.db import engine, fetch_all, fetch_one
from app.infra.mailer import send_mail
from app.rbac import domains
from app.rbac.authz import (
    allowed_codes,
    allowed_patterns,
    can,
    forbidden,
    require_any,
    require_permission,
    usernames_with,
)
from app.services.data_import import engine as importer
from app.services.data_import.parsing import ImportFileError
from app.services.data_import.service import after_import
from app.services.data_import.specs import DATASETS, MAX_FILE_BYTES, SUBMITTABLE
from app.services.data_import.templates import describe, template
from app.services.events import log_event
from app.ws.hub import hub

router = APIRouter(prefix="/data-import", tags=["Nhập dữ liệu"])
IMPORT = require_permission("data", "import")
SUBMIT = require_any("data", "submit")
MAX_PENDING = 20  # hồ sơ chờ duyệt tối đa của một người gửi
STATUS_LABEL = {"cho_duyet": "chờ duyệt", "da_duyet": "đã duyệt", "tu_choi": "bị từ chối", "da_rut": "đã rút"}


async def import_or_submit(user: dict = Depends(current_user)) -> dict:
    if not can(user, "data", "import") and allowed_patterns(user, "data", "submit") == []:
        raise forbidden()
    return user


def _scope(user: dict) -> list[str] | None:
    """Phạm vi kiểm tra tệp: None = nhập thẳng toàn tỉnh (data.import); còn lại = các xã người dùng được gửi."""
    return None if can(user, "data", "import") else allowed_codes(user, "data", "submit")


def _dataset(name: str, user: dict | None = None):
    if name not in DATASETS:
        raise HTTPException(404, "Không có loại dữ liệu này")
    if user is not None and not can(user, "data", "import") and name not in SUBMITTABLE:
        raise HTTPException(403, f"{DATASETS[name].label} do cấp tỉnh nhập — xã/phường không gửi được")
    return DATASETS[name]


async def _read(file: UploadFile) -> bytes:
    data = await file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, f"Tệp quá lớn (tối đa {MAX_FILE_BYTES // (1024 * 1024)} MB)")
    return data


def _replace(mode: str) -> bool:
    if mode not in ("upsert", "replace"):
        raise HTTPException(422, "Chế độ phải là upsert hoặc replace")
    return mode == "replace"


def _describe(ds, scoped: bool) -> dict:
    d = {**describe(ds), "submittable": ds.name in SUBMITTABLE}
    if scoped:  # xã chỉ gửi đúng cấp (VD danh bạ cấp xã / thôn) → form chỉ hiện các lựa chọn hợp lệ
        rules = SUBMITTABLE.get(ds.name, {})
        for f in d["fields"]:
            if f["name"] in rules:
                f["choices"] = list(rules[f["name"]])
                f["example"] = rules[f["name"]][0]
    return d


@router.get("/datasets")
async def datasets(user: dict = Depends(import_or_submit)):
    if can(user, "data", "import"):
        return [_describe(ds, False) for ds in DATASETS.values()]
    return [_describe(DATASETS[name], True) for name in SUBMITTABLE]


@router.get("/datasets/{name}/template")
async def dataset_template(name: str, user: dict = Depends(import_or_submit)):
    ds = _dataset(name, user)
    scope = _scope(user)
    examples, center = None, None
    if scope:  # tệp mẫu của xã: mã xã, cấp, vị trí mẫu nằm trong xã mình → kiểm tra hợp lệ ngay
        examples = {f: ok[0] for f, ok in SUBMITTABLE.get(name, {}).items()} | {"ma_xa": scope[0]}
        c = await fetch_one(
            """SELECT ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lon
                 FROM spatial_admin.administrative_units WHERE code = :c""",
            {"c": scope[0]},
        )
        center = (c["lat"], c["lon"]) if c and c["lat"] is not None else None
    body, filename, media_type = template(ds, examples, center, await importer.template_rows(ds))
    return Response(
        body, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/datasets/{name}/validate")
async def validate_file(
    name: str,
    file: UploadFile = File(...),
    mode: str = Form("upsert"),
    user: dict = Depends(import_or_submit),
):
    _dataset(name, user)
    try:
        report, _rows = await importer.validate(
            name, file.filename or "", await _read(file), _replace(mode), _scope(user)
        )
    except ImportFileError as exc:
        raise HTTPException(422, str(exc)) from exc
    return report.to_dict()


@router.post("/datasets/{name}/apply")
async def apply_file(
    name: str, file: UploadFile = File(...), mode: str = Form("upsert"), user: dict = Depends(IMPORT)
):
    _dataset(name)
    replace = _replace(mode)
    filename = file.filename or ""
    try:
        report, result = await importer.apply(name, filename, await _read(file), replace)
    except ImportFileError as exc:
        raise HTTPException(422, str(exc)) from exc
    if result is None:
        return JSONResponse(
            status_code=422, content={"detail": "Tệp còn lỗi — chưa ghi gì", "report": report.to_dict()}
        )
    await after_import(user, name, filename, replace, report, result)
    return {"report": report.to_dict(), "result": result}


# ------------------------------------------------------------------ hồ sơ xã/phường gửi, cấp tỉnh duyệt

SUBMISSION_SELECT = """
SELECT s.id, s.code, s.dataset, s.mode, s.filename, s.scope_codes, s.admin_codes, s.note, s.summary, s.status,
       s.submitted_by, s.submitted_at, s.reviewed_at, s.review_note, s.result, octet_length(s.content) AS size,
       su.full_name AS submitted_by_name, su.position AS submitted_by_position, su.email AS submitter_email,
       ru.full_name AS reviewed_by_name
  FROM operations.data_submissions s
  JOIN communications.users su ON su.id = s.submitted_by
  LEFT JOIN communications.users ru ON ru.id = s.reviewed_by
"""


def _visible(user: dict) -> tuple[str, dict]:
    """Cấp tỉnh (data.import) thấy mọi hồ sơ; người gửi thấy hồ sơ của mình và hồ sơ có bản ghi thuộc xã mình."""
    codes = None if can(user, "data", "import") else allowed_codes(user, "data", "submit")
    if codes is None:
        return "TRUE", {}
    return (
        "(s.submitted_by = CAST(:me AS uuid) OR s.admin_codes && CAST(:codes AS text[]))",
        {"me": str(user["id"]), "codes": codes},
    )


def _names(codes: list[str]) -> str:
    by_code = {u.code: u.name for u in domains.units()}
    return ", ".join(by_code.get(c, c) for c in codes) or "toàn tỉnh"


def _what(dataset: str, s: dict) -> str:
    parts = [f"{s.get('creates', 0)} mới", f"{s.get('updates', 0)} cập nhật"]
    if s.get("deletes"):
        parts.append(f"{s['deletes']} xoá")
    return f"{DATASETS[dataset].label}: {', '.join(parts)}"


def _out(s: dict, user: dict, full: bool = False) -> dict:
    summary = s["summary"] or {}
    own = s["submitted_by"] == user["id"]
    out = {
        k: s[k]
        for k in (
            "id", "code", "dataset", "mode", "filename", "admin_codes", "note", "status", "submitted_at",
            "reviewed_at", "review_note", "result", "size", "submitted_by_name", "submitted_by_position",
            "reviewed_by_name",
        )
    }  # fmt: skip
    out.update(
        dataset_label=DATASETS[s["dataset"]].label if s["dataset"] in DATASETS else s["dataset"],
        admin_names=_names(s["admin_codes"] or []),
        own=own,
        can_review=s["status"] == "cho_duyet" and not own and can(user, "data", "import"),
        can_withdraw=s["status"] == "cho_duyet" and own,
        summary=summary
        if full
        else {k: summary.get(k) for k in ("total", "creates", "updates", "deletes", "warning_count")},
    )
    return out


# Hồ sơ theo mã (HS-1001 — link trong email, ?ho-so= trên trang) hoặc id
BY_KEY = "(s.code = :id OR s.id::text = :id)"


async def _load(sub_id: str, user: dict) -> dict:
    where, params = _visible(user)
    s = await fetch_one(SUBMISSION_SELECT + f" WHERE {BY_KEY} AND {where}", {"id": sub_id, **params})
    if not s:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    return s


async def _notify(event_status: str, s: dict) -> None:
    await hub.publish(
        "submission.updated",
        {"id": s["id"], "code": s["code"], "dataset": s["dataset"], "status": event_status},
    )


async def _mail_approvers(code: str, user: dict, what: str, where: str, note: str | None) -> None:
    """Báo người có quyền duyệt (data.import toàn tỉnh) có hồ sơ mới — ngoài số đếm trên menu."""
    names = usernames_with("data", "import") - {user["username"]}
    if not names:
        return
    rows = await fetch_all(
        """SELECT email FROM communications.users
            WHERE username = ANY(:u) AND is_active AND coalesce(email, '') <> ''""",
        {"u": sorted(names)},
    )
    link = f"{settings.public_base_url.rstrip('/')}/nhap-du-lieu?ho-so={code}"
    body = (
        f"{user['full_name']} ({where}) vừa gửi hồ sơ dữ liệu {code} chờ phê duyệt.\n\n{what}\n"
        + (f"Ghi chú: {note}\n" if note else "")
        + f"\nXem thay đổi và phê duyệt / từ chối: {link}\n\nDữ liệu chỉ hiển thị sau khi được phê duyệt.\n"
    )
    subject = f"[BCH PCTT Cao Bằng] Hồ sơ dữ liệu {code} chờ phê duyệt"
    await asyncio.gather(*(send_mail(r["email"], subject, body) for r in rows))


async def _mail_submitter(s: dict, approved: bool, reviewer: dict, note: str | None) -> None:
    if not s.get("submitter_email"):
        return
    what = _what(s["dataset"], s["summary"] or {})
    if approved:
        subject = f"[BCH PCTT Cao Bằng] Hồ sơ {s['code']} đã được phê duyệt"
        body = f"Hồ sơ {s['code']} ({what}) đã được {reviewer['full_name']} phê duyệt; dữ liệu đã cập nhật vào hệ thống.\n"
    else:
        subject = f"[BCH PCTT Cao Bằng] Hồ sơ {s['code']} bị từ chối"
        body = (
            f"Hồ sơ {s['code']} ({what}) bị {reviewer['full_name']} từ chối.\nLý do: {note}\n\n"
            "Sửa lại dữ liệu rồi gửi hồ sơ mới ở trang Nhập dữ liệu.\n"
        )
    if approved and note:
        body += f"Ghi chú của người duyệt: {note}\n"
    link = f"{settings.public_base_url.rstrip('/')}/nhap-du-lieu?ho-so={s['code']}"
    await send_mail(s["submitter_email"], subject, body + f"\nXem hồ sơ: {link}\n")


def _unit_id(codes: list[str]):
    if len(codes) != 1:
        return None
    return next((u.id for u in domains.units() if u.code == codes[0]), None)


@router.post("/submissions", status_code=201)
async def submit(
    name: str = Form(...),
    file: UploadFile = File(...),
    mode: str = Form("upsert"),
    note: str | None = Form(None, max_length=500),
    user: dict = Depends(SUBMIT),
):
    """Xã/phường gửi dữ liệu chờ cấp tỉnh phê duyệt — kiểm tra như nhập thường + giới hạn trong xã mình."""
    if name not in SUBMITTABLE:
        raise HTTPException(403, "Loại dữ liệu này do cấp tỉnh nhập — xã/phường không gửi được")
    scope = allowed_codes(user, "data", "submit")
    replace = _replace(mode)
    filename = file.filename or ""
    data = await _read(file)
    pending = await fetch_one(
        "SELECT count(*) AS n FROM operations.data_submissions WHERE submitted_by = :u AND status = 'cho_duyet'",
        {"u": user["id"]},
    )
    if pending["n"] >= MAX_PENDING:
        raise HTTPException(
            429, f"Bạn đang có {pending['n']} hồ sơ chờ duyệt — chờ cấp tỉnh xử lý rồi gửi tiếp"
        )
    try:
        report, rows = await importer.validate(name, filename, data, replace, scope)
    except ImportFileError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not report.ok:
        return JSONResponse(
            status_code=422, content={"detail": "Tệp còn lỗi — chưa gửi", "report": report.to_dict()}
        )
    if not (report.creates or report.updates or report.deletes):
        raise HTTPException(422, "Tệp không có bản ghi nào")
    codes = sorted({r.ma_xa or r.values.get("ma_xa") for r in rows} - {None}) or (
        list(scope) if scope and len(scope) <= 3 else []
    )
    summary = report.to_dict()
    note = (note or "").strip() or None
    row = await fetch_one(
        """INSERT INTO operations.data_submissions
                  (dataset, mode, filename, content, scope_codes, admin_codes, note, summary, submitted_by)
           VALUES (:d, :m, :f, :c, :s, :a, :n, CAST(:sum AS jsonb), :u) RETURNING id, code""",
        {
            "d": name,
            "m": mode,
            "f": filename[:200],
            "c": data,
            "s": scope,
            "a": codes,
            "n": note,
            "sum": json.dumps(summary, ensure_ascii=False, default=str),
            "u": user["id"],
        },
    )
    what, where = _what(name, summary), _names(codes)
    await audit(
        user,
        "data.submit",
        "data_submission",
        row["code"],
        {"dataset": name, "file": filename, "mode": mode, "communes": codes, "rows": report.total},
    )
    await _notify("cho_duyet", {**row, "dataset": name})
    await log_event(
        f"{user['full_name']} ({where}) gửi hồ sơ {row['code']} — {what} — chờ cấp tỉnh phê duyệt",
        "he_thong",
        "info",
        admin_unit_id=_unit_id(codes),
    )
    await _mail_approvers(row["code"], user, what, where, note)
    return _out(await _load(str(row["id"]), user), user, full=True)


@router.get("/submissions")
async def submissions(
    status: str | None = Query(None, pattern="^(cho_duyet|da_duyet|tu_choi|da_rut)$"),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(import_or_submit),
):
    where, params = _visible(user)
    rows = await fetch_all(
        SUBMISSION_SELECT
        + f""" WHERE {where} AND (CAST(:st AS text) IS NULL OR s.status = CAST(:st AS text))
              ORDER BY s.submitted_at DESC LIMIT :l""",
        {**params, "st": status, "l": limit},
    )
    counts = await fetch_all(
        f"SELECT s.status, count(*) AS n FROM operations.data_submissions s WHERE {where} GROUP BY s.status",
        params,
    )
    return {"items": [_out(r, user) for r in rows], "counts": {r["status"]: r["n"] for r in counts}}


@router.get("/submissions/{sub_id}")
async def submission_detail(sub_id: str, user: dict = Depends(import_or_submit)):
    s = await _load(sub_id, user)
    out = _out(s, user, full=True)
    if s["status"] == "cho_duyet":
        # Kiểm tra lại với dữ liệu HIỆN TẠI → người duyệt thấy đúng những gì sẽ ghi (giá trị cũ → mới, bản ghi bị xoá)
        content = await fetch_one(
            "SELECT content FROM operations.data_submissions WHERE id = :id", {"id": s["id"]}
        )
        replace = s["mode"] == "replace"
        try:
            report, rows = await importer.validate(
                s["dataset"], s["filename"], bytes(content["content"]), replace, s["scope_codes"]
            )
        except ImportFileError as exc:
            out["check"] = {
                "ok": False,
                "error_count": 1,
                "errors": [{"row": 0, "field": None, "message": str(exc)}],
            }
        else:
            out["check"] = report.to_dict()
            if report.ok:
                out["changes"] = await importer.describe_changes(
                    DATASETS[s["dataset"]], rows, replace, s["scope_codes"]
                )
    return out


@router.get("/submissions/{sub_id}/file")
async def submission_file(sub_id: str, user: dict = Depends(import_or_submit)):
    s = await _load(sub_id, user)
    content = await fetch_one(
        "SELECT content FROM operations.data_submissions WHERE id = :id", {"id": s["id"]}
    )
    ext = s["filename"].rsplit(".", 1)[-1].lower() if "." in s["filename"] else "csv"
    return Response(
        bytes(content["content"]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{s["code"]}.{ext}"'},
    )


class ReviewIn(BaseModel):
    note: str | None = Field(None, max_length=500)


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


@router.post("/submissions/{sub_id}/approve")
async def approve(sub_id: str, body: ReviewIn | None = None, user: dict = Depends(IMPORT)):
    note = ((body.note if body else None) or "").strip() or None
    async with engine.begin() as conn:
        # Khoá hồ sơ tới hết transaction: hai người bấm duyệt cùng lúc → người sau thấy "đã duyệt", không ghi 2 lần
        s = (
            (
                await conn.execute(
                    text(f"SELECT * FROM operations.data_submissions s WHERE {BY_KEY} FOR UPDATE"),
                    {"id": sub_id},
                )
            )
            .mappings()
            .first()
        )
        if not s:
            raise HTTPException(404, "Không tìm thấy hồ sơ")
        if s["status"] != "cho_duyet":
            raise HTTPException(409, f"Hồ sơ {s['code']} đã {STATUS_LABEL[s['status']]}")
        if s["submitted_by"] == user["id"]:
            raise HTTPException(403, "Người gửi không tự phê duyệt hồ sơ của mình")
        ds = DATASETS[s["dataset"]]
        replace = s["mode"] == "replace"
        try:
            report, rows = await importer.validate(
                s["dataset"], s["filename"], bytes(s["content"]), replace, s["scope_codes"]
            )
        except ImportFileError as exc:
            raise HTTPException(422, str(exc)) from exc
        if not report.ok:  # dữ liệu đã đổi từ lúc gửi (VD mã đã được dùng) → từ chối để xã gửi lại
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "Hồ sơ không còn hợp lệ với dữ liệu hiện tại — chưa ghi gì",
                    "report": report.to_dict(),
                },
            )
        result = await importer.apply_rows(ds, rows, replace, s["scope_codes"], conn=conn)
        await conn.execute(
            text(
                """UPDATE operations.data_submissions SET status = 'da_duyet', reviewed_by = :u, reviewed_at = now(),
                          review_note = :n, result = CAST(:r AS jsonb) WHERE id = :id"""
            ),
            {"u": user["id"], "n": note, "r": json.dumps(result), "id": s["id"]},
        )
    full = await _load(sub_id, user)
    await after_import(user, s["dataset"], s["filename"], replace, report, result, submission=full)
    await _notify("da_duyet", full)
    await _mail_submitter(full, True, user, note)
    return _out(full, user, full=True)


@router.post("/submissions/{sub_id}/reject")
async def reject(sub_id: str, body: RejectIn, user: dict = Depends(IMPORT)):
    row = await fetch_one(
        f"""UPDATE operations.data_submissions s SET status = 'tu_choi', reviewed_by = :u, reviewed_at = now(),
                   review_note = :r
             WHERE {BY_KEY} AND status = 'cho_duyet' RETURNING id""",
        {"u": user["id"], "r": body.reason.strip(), "id": sub_id},
    )
    s = await _load(sub_id, user)
    if not row:
        raise HTTPException(409, f"Hồ sơ {s['code']} đã {STATUS_LABEL[s['status']]}")
    await audit(user, "data.submission.reject", "data_submission", s["code"], {"reason": body.reason.strip()})
    await _notify("tu_choi", s)
    await log_event(
        f"{user['full_name']} từ chối hồ sơ {s['code']} của {s['submitted_by_name']} — {s['review_note']}",
        "he_thong",
        "info",
        admin_unit_id=_unit_id(s["admin_codes"] or []),
    )
    await _mail_submitter(s, False, user, s["review_note"])
    return _out(s, user, full=True)


@router.post("/submissions/{sub_id}/withdraw")
async def withdraw(sub_id: str, user: dict = Depends(current_user)):
    """Người gửi rút hồ sơ đang chờ duyệt (gửi nhầm, cần sửa)."""
    row = await fetch_one(
        f"""UPDATE operations.data_submissions s SET status = 'da_rut', reviewed_at = now()
             WHERE {BY_KEY} AND submitted_by = :u AND status = 'cho_duyet' RETURNING id""",
        {"u": user["id"], "id": sub_id},
    )
    s = await _load(sub_id, user)
    if not row:
        raise HTTPException(
            409 if s["submitted_by"] == user["id"] else 403, "Chỉ người gửi rút được hồ sơ đang chờ duyệt"
        )
    await audit(user, "data.submission.withdraw", "data_submission", s["code"])
    await _notify("da_rut", s)
    return _out(s, user, full=True)
