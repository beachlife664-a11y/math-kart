#!/usr/bin/env python3
import io
import json
import struct
import sys
from pathlib import Path
from PIL import Image

if len(sys.argv) < 3:
    raise SystemExit('Usage: python3 scripts/compress-glb-textures.py input.glb output.glb [max-size]')
source_path, output_path = Path(sys.argv[1]), Path(sys.argv[2])
max_size = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
source = source_path.read_bytes()
json_length = struct.unpack_from('<I', source, 12)[0]
document = json.loads(source[20:20 + json_length])
bin_length = struct.unpack_from('<I', source, 20 + json_length)[0]
binary = source[28 + json_length:28 + json_length + bin_length]
replacements = {}
for index, image in enumerate(document.get('images', [])):
    if 'bufferView' not in image:
        continue
    view = document['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    payload = binary[start:start + view['byteLength']]
    decoded = Image.open(io.BytesIO(payload))
    decoded.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    name = image.get('name', '').lower()
    if 'normal' in name:
        decoded.save(output, format='WEBP', lossless=True, quality=100, method=6)
    else:
        decoded.save(output, format='WEBP', quality=90, method=6)
    replacements[image['bufferView']] = output.getvalue()
    image['mimeType'] = 'image/webp'
    print(f'{source_path.name}: image {index} {len(payload)} -> {len(replacements[image["bufferView"]])} bytes, {decoded.size}')
if replacements:
    for texture in document.get('textures', []):
        if 'source' not in texture:
            continue
        texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
    for key in ('extensionsUsed', 'extensionsRequired'):
        extensions = set(document.get(key, []))
        extensions.add('EXT_texture_webp')
        document[key] = sorted(extensions)
chunks = []
offset = 0
for index, view in enumerate(document.get('bufferViews', [])):
    start = view.get('byteOffset', 0)
    payload = replacements.get(index, binary[start:start + view['byteLength']])
    padding = (4 - offset % 4) % 4
    if padding:
        chunks.append(bytes(padding))
        offset += padding
    view['byteOffset'] = offset
    view['byteLength'] = len(payload)
    chunks.append(payload)
    offset += len(payload)
new_binary = b''.join(chunks)
document['buffers'] = [{'byteLength': len(new_binary)}]
json_bytes = json.dumps(document, separators=(',', ':')).encode()
json_bytes += b' ' * ((4 - len(json_bytes) % 4) % 4)
total_length = 12 + 8 + len(json_bytes) + 8 + len(new_binary)
header = struct.pack('<III', 0x46546C67, 2, total_length)
json_header = struct.pack('<II', len(json_bytes), 0x4E4F534A)
bin_header = struct.pack('<II', len(new_binary), 0x004E4942)
output_path.write_bytes(header + json_header + json_bytes + bin_header + new_binary)
print(f'{output_path}: {len(source)} -> {total_length} bytes')
