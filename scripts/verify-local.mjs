import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = Number(process.env.PORT ?? 28474);
const origin = `http://127.0.0.1:${port}`;
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
}
const checks = [];
let server;
try {
  await mkdir('artifacts/reproduction', { recursive: true });
  run(npm, ['run', 'verify:assets']);
  run(npm, ['run', 'lint']); checks.push('assets', 'lint');
  run(npm, ['run', 'build']);
  run(npm, ['run', 'prepare:preview']); checks.push('production-build');
  server = spawn(process.execPath, ['scripts/static-server.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'inherit' });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(origin)).ok) break; } catch { /* wait for server */ }
    if (attempt === 99) throw new Error('Preview server did not start');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  run(npm, ['test'], { ...process.env, BASE_URL: origin });
  run(npm, ['run', 'test:audio'], { ...process.env, BASE_URL: origin }); checks.push('playwright-9-of-9');
  run(npm, ['run', 'test:compat'], { ...process.env, BASE_URL: `${origin}/?qa=1`, REPORT_PATH: 'artifacts/reproduction/browser-compatibility.json' }); checks.push('three-browsers');
  run(npm, ['run', 'test:release'], { ...process.env, BASE_URL: origin, REPORT_PATH: 'artifacts/reproduction/release-smoke.json' }); checks.push('production-player-entry');
  run(process.execPath, ['scripts/inspect-threejs-canvas.mjs', '--manifest', 'artifacts/reproduction-manifest.json', '--seed', '42'], { ...process.env, BASE_URL: `${origin}/?qa=1` });
  run(process.execPath, ['scripts/check-evidence.mjs', 'artifacts/reproduction-manifest.json']); checks.push('desktop-mobile-pixels-and-budgets');
  if (process.argv.includes('--full-race')) {
    run(npm, ['run', 'test:race'], { ...process.env, BASE_URL: `${origin}/?qa=1`, RUN_NAME: 'reproduction/full-race' });
    checks.push('full-two-lap-answer-only-race');
  }
  await mkdir('artifacts/reproduction', { recursive: true });
  await writeFile('artifacts/reproduction/summary.json', `${JSON.stringify({ ok: true, origin, checks }, null, 2)}\n`);
  console.log(`\nLocal reproduction verification passed: ${checks.join(', ')}`);
} finally {
  server?.kill('SIGTERM');
}
