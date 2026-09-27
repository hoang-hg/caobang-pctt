FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    RUFF_CACHE_DIR=/tmp/.ruff_cache PYTEST_ADDOPTS="-p no:cacheprovider"
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 60 -r requirements.txt
COPY . .
# Chạy bằng tài khoản không có quyền root; /app/storage chứa ảnh khi không dùng MinIO
RUN useradd --system --uid 10001 --no-create-home app && mkdir -p /app/storage && chown app /app/storage
USER app
EXPOSE 8000
# Mặc định chỉ chạy API. Migration + seed chạy MỘT lần trước đó (service "migrate" trong docker-compose.prod.yml);
# docker-compose.yml (dev) tự ghép "alembic upgrade head && python -m app.seed" trước lệnh này.
CMD ["sh", "-c", "exec gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${API_WORKERS:-2} -b 0.0.0.0:8000 --timeout 120 --graceful-timeout 30 --access-logfile -"]
