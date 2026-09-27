"""Nhập dữ liệu chính thức từ tệp: /api/v1/data-import/* (quyền data.import, phạm vi toàn tỉnh).

Hai bước: /validate (không ghi gì, trả lỗi theo dòng) → /apply (kiểm tra lại rồi ghi trong 1 transaction).
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from app.rbac.authz import require_permission
from app.services.data_import import engine as importer
from app.services.data_import.parsing import ImportFileError
from app.services.data_import.service import after_import
from app.services.data_import.specs import DATASETS, MAX_FILE_BYTES
from app.services.data_import.templates import describe, template

router = APIRouter(prefix="/data-import", tags=["Nhập dữ liệu"])
IMPORT = require_permission("data", "import")


def _dataset(name: str):
    if name not in DATASETS:
        raise HTTPException(404, "Không có loại dữ liệu này")
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


@router.get("/datasets")
async def datasets(_: dict = Depends(IMPORT)):
    return [describe(ds) for ds in DATASETS.values()]


@router.get("/datasets/{name}/template")
async def dataset_template(name: str, _: dict = Depends(IMPORT)):
    body, filename, media_type = template(_dataset(name))
    return Response(
        body, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.post("/datasets/{name}/validate")
async def validate_file(
    name: str, file: UploadFile = File(...), mode: str = Form("upsert"), _: dict = Depends(IMPORT)
):
    _dataset(name)
    try:
        report, _rows = await importer.validate(name, file.filename or "", await _read(file), _replace(mode))
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
