#!/usr/bin/env python3
"""Prepare local, seamless-ish albedo and normal textures for the v4 world."""
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts' / 'art-v4' / 'textures'
OUTPUT = ROOT / 'public' / 'textures'
OUTPUT.mkdir(parents=True, exist_ok=True)

STRENGTH = {'asphalt': 2.2, 'grass': 1.15, 'rock': 3.0, 'sand': 1.5}


def seamless_edges(image: Image.Image, width: int = 56) -> Image.Image:
    """Cross-fade opposite borders to hide the worst generated-image seams."""
    array = np.asarray(image.convert('RGB'), dtype=np.float32)
    result = array.copy()
    size = array.shape[0]
    ramp = np.linspace(0.0, 1.0, width, dtype=np.float32)
    for index in range(width):
        alpha = 0.5 * (1.0 - ramp[index])
        opposite = size - width + index
        result[index, :, :] = array[index, :, :] * (1 - alpha) + array[opposite, :, :] * alpha
        result[opposite, :, :] = array[opposite, :, :] * (1 - alpha) + array[index, :, :] * alpha
        result[:, index, :] = array[:, index, :] * (1 - alpha) + array[:, opposite, :] * alpha
        result[:, opposite, :] = array[:, opposite, :] * (1 - alpha) + array[:, index, :] * alpha
    return Image.fromarray(np.clip(result, 0, 255).astype(np.uint8), 'RGB')


def normal_map(image: Image.Image, strength: float) -> Image.Image:
    gray = np.asarray(image.convert('L').filter(ImageFilter.GaussianBlur(1.1)), dtype=np.float32) / 255.0
    dx = (np.roll(gray, -1, axis=1) - np.roll(gray, 1, axis=1)) * strength
    dy = (np.roll(gray, -1, axis=0) - np.roll(gray, 1, axis=0)) * strength
    normal = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    return Image.fromarray(np.clip((normal * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), 'RGB')


def procedural_asphalt() -> Image.Image:
    """Local deterministic fallback; the generated asphalt URL was unreachable."""
    rng = np.random.default_rng(418)
    size = 1024
    broad = np.asarray(Image.fromarray(rng.integers(0, 255, (24, 24), dtype=np.uint8)).resize((size, size), Image.Resampling.BICUBIC), dtype=np.float32) - 127
    fine = rng.normal(0, 7.5, (size, size))
    aggregate = rng.normal(0, 3.2, (size, size))
    base = np.clip(91 + broad * 0.08 + fine + aggregate, 52, 132).astype(np.uint8)
    image = Image.fromarray(base, 'L').convert('RGB')
    draw = ImageDraw.Draw(image, 'RGBA')
    for _ in range(18):
        x, y = rng.integers(0, size, 2)
        points = [(int(x), int(y))]
        for _ in range(int(rng.integers(3, 8))):
            x += int(rng.integers(-28, 29))
            y += int(rng.integers(10, 38))
            points.append((int(x), int(y)))
        draw.line(points, fill=(38, 43, 46, 95), width=1)
    for _ in range(1600):
        x, y = rng.integers(0, size, 2)
        shade = int(rng.integers(105, 157))
        draw.point((int(x), int(y)), fill=(shade, shade, shade, 75))
    return image


missing = [name for name in ['grass', 'rock', 'sand'] if not (SOURCE / f'{name}.png').exists()]
if missing:
    print(f'Missing source textures: {missing}', file=sys.stderr)
    sys.exit(1)

for name, strength in STRENGTH.items():
    if name == 'asphalt' and not (SOURCE / 'asphalt.png').exists():
        source = procedural_asphalt()
        print('asphalt reference download unavailable; using documented procedural albedo')
    else:
        source = Image.open(SOURCE / f'{name}.png').convert('RGB')
    source = source.resize((1024, 1024), Image.Resampling.LANCZOS)
    color = seamless_edges(source)
    color.save(OUTPUT / f'{name}-color.jpg', quality=91, optimize=True, subsampling=0)
    normal_map(color, strength).save(OUTPUT / f'{name}-normal.jpg', quality=90, optimize=True)
    print(f'prepared {name}: 1024 color + normal')
