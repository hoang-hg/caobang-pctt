"""Lưu trữ tệp (ảnh phản ánh…): MinIO/S3 khi cấu hình MINIO_ENDPOINT, ngược lại thư mục cục bộ.

Bucket để **riêng tư** — ảnh chỉ được phục vụ qua backend (kiểm tra trạng thái duyệt trước khi trả cho công chúng).
"""

from __future__ import annotations

import asyncio
import io
import logging
from pathlib import Path

from app.config import settings

log = logging.getLogger(__name__)
_client = None


def _minio():
    global _client
    if not settings.minio_endpoint:
        return None
    if _client is None:
        from minio import Minio

        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _client


def _local_path(key: str) -> Path:
    base = Path(settings.local_storage_dir).resolve()
    path = (base / key).resolve()
    if base not in path.parents:
        raise ValueError("Khoá tệp không hợp lệ")
    return path


async def ensure_bucket() -> None:
    client = _minio()
    if client is None:
        Path(settings.local_storage_dir).mkdir(parents=True, exist_ok=True)
        return
    try:
        exists = await asyncio.to_thread(client.bucket_exists, settings.minio_bucket)
        if not exists:
            await asyncio.to_thread(client.make_bucket, settings.minio_bucket)
            log.info("Đã tạo bucket %s", settings.minio_bucket)
    except Exception:
        log.exception("Không kết nối được MinIO %s", settings.minio_endpoint)


async def put(key: str, data: bytes, content_type: str) -> None:
    client = _minio()
    if client is None:
        path = _local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
        return
    await asyncio.to_thread(
        client.put_object, settings.minio_bucket, key, io.BytesIO(data), len(data), content_type=content_type
    )


async def get(key: str) -> bytes:
    client = _minio()
    if client is None:
        return await asyncio.to_thread(_local_path(key).read_bytes)

    def _read() -> bytes:
        resp = client.get_object(settings.minio_bucket, key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    return await asyncio.to_thread(_read)


async def delete(key: str) -> None:
    client = _minio()
    if client is None:
        _local_path(key).unlink(missing_ok=True)
        return
    await asyncio.to_thread(client.remove_object, settings.minio_bucket, key)


def backend_name() -> str:
    return (
        f"MinIO {settings.minio_endpoint}/{settings.minio_bucket}"
        if settings.minio_endpoint
        else "thư mục cục bộ"
    )
