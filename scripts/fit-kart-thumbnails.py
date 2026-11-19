from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IDS = ['comet', 'reef', 'bolt', 'sprout', 'nova', 'titan', 'mochi']
SOURCE = ROOT / 'artifacts/v7-ui/raw-thumbnails'
OUTPUT = ROOT / 'public/models/thumbnails'
EVIDENCE = ROOT / 'artifacts/v7-ui'
OUTPUT.mkdir(parents=True, exist_ok=True)
EVIDENCE.mkdir(parents=True, exist_ok=True)
records = []

for kart_id in IDS:
    source = Image.open(SOURCE / f'{kart_id}.png').convert('RGBA')
    bbox = source.getchannel('A').getbbox()
    if not bbox:
        raise RuntimeError(f'{kart_id}: transparent or empty render')
    car = source.crop(bbox)
    scale = min(444 / car.width, 258 / car.height)
    size = (max(1, round(car.width * scale)), max(1, round(car.height * scale)))
    car = car.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (480, 300), (0, 0, 0, 0))
    canvas.alpha_composite(car, ((480 - car.width) // 2, (300 - car.height) // 2 - 3))
    target = OUTPUT / f'{kart_id}.png'
    canvas.save(target, optimize=True)
    records.append({
        'id': kart_id,
        'sourceBounds': list(bbox),
        'fittedCarSize': list(size),
        'output': f'public/models/thumbnails/{kart_id}.png',
        'bytes': target.stat().st_size,
    })

cell_w, cell_h = 360, 278
sheet = Image.new('RGB', (cell_w * 4, cell_h * 2), (9, 30, 39))
draw = ImageDraw.Draw(sheet)
for index, kart_id in enumerate(IDS):
    image = Image.open(OUTPUT / f'{kart_id}.png').convert('RGBA')
    image.thumbnail((340, 236), Image.Resampling.LANCZOS)
    cell_x = (index % 4) * cell_w
    cell_y = (index // 4) * cell_h
    x = cell_x + (cell_w - image.width) // 2
    y = cell_y + (240 - image.height) // 2
    sheet.paste(image, (x, y), image)
    draw.text((cell_x + 16, cell_y + 248), f'{index + 1:02d}  {kart_id.upper()}', fill=(85, 228, 210))
sheet.save(EVIDENCE / 'thumbnail-sheet.png')
(EVIDENCE / 'thumbnail-fit-report.json').write_text(json.dumps({'ok': True, 'count': len(records), 'records': records}, indent=2) + '\n')
print(json.dumps({'ok': True, 'count': len(records), 'output': 'public/models/thumbnails'}, indent=2))
