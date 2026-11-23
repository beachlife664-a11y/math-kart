import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('public');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(item));
    else if (entry.isFile()) files.push(item);
  }
  return files;
}
const files = [];
for (const file of (await walk(root)).sort()) {
  const bytes = await readFile(file);
  files.push({
    path: path.relative(root, file).split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const manifest = { version: 1, algorithm: 'sha256', root: 'public', files };
await writeFile('assets/runtime-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Hashed ${files.length} runtime files (${(files.reduce((sum, file) => sum + file.bytes, 0) / 1048576).toFixed(1)} MiB).`);
