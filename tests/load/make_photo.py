"""Tạo ảnh mẫu 12 MP (~4 MB, giống ảnh chụp điện thoại) cho kịch bản gửi phản ánh của tests/load/load.js.

docker run --rm -u 0 -v "$PWD/tests/load:/out" caobang-pctt-backend python /out/make_photo.py
"""

from pathlib import Path

from PIL import Image, ImageChops

out = Path(__file__).with_name("photo.jpg")
w, h = 4000, 3000
gradient = Image.linear_gradient("L").resize((w, h)).convert("RGB")
noise = Image.effect_noise((w, h), 40).convert("RGB")
ImageChops.blend(gradient, noise, 0.35).save(out, "JPEG", quality=85)
print(f"{out.name}: {out.stat().st_size // 1024} KB")
