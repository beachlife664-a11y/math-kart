import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile('assets/runtime-manifest.json', 'utf8'));
const errors = [];
for (const entry of manifest.files) {
  try {
    const bytes = await readFile(path.join('public', entry.path));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== entry.bytes || sha256 !== entry.sha256) errors.push(`${entry.path}: content hash mismatch`);
  } catch {
    errors.push(`${entry.path}: missing`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  throw new Error(`Runtime asset verification failed (${errors.length} issue(s)). Restore the repository files before building.`);
}
console.log(`Runtime assets verified: ${manifest.files.length}/${manifest.files.length} files match SHA-256.`);
