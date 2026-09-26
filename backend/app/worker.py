"""Tiến trình nền (RUN_MODE=worker): chạy đúng 1 bản trong cụm triển khai.

python -m app.worker
"""

import asyncio
import logging
import signal

from app.config import settings
from app.lifecycle import shutdown, startup

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)


async def main() -> None:
    if settings.run_mode != "worker":
        settings.run_mode = "worker"
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows
            pass
    await startup()
    await stop.wait()
    await shutdown()


if __name__ == "__main__":
    asyncio.run(main())
