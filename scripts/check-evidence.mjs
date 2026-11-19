import { readFile, stat } from 'node:fs/promises';

const manifestPath = process.argv[2] ?? 'artifacts/reproduction-manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const errors = [];
for (const capture of manifest.captures ?? []) {
  try {
    const report = JSON.parse(await readFile(capture.report, 'utf8'));
    if (report.runId !== manifest.runId || report.mode !== capture.mode || report.state !== capture.state || !report.result?.ok) {
      errors.push(`${capture.report}: stale, mismatched or failed capture`);
    }
  } catch { errors.push(`${capture.report}: missing or invalid`); }
}
for (const file of manifest.artifacts ?? []) {
  try { if ((await stat(file)).size === 0) errors.push(`${file}: empty`); }
  catch { errors.push(`${file}: missing`); }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Evidence check passed: ${(manifest.captures?.length ?? 0) + (manifest.artifacts?.length ?? 0)} artifact(s) confirmed.`);
