from sqlalchemy import create_engine

from alembic import context
from app.config import settings

# Migration chạy đồng bộ bằng psycopg3 (hỗ trợ nhiều câu lệnh SQL trong một lần execute)
engine = create_engine(settings.database_url)

with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()
