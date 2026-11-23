import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

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
  if (process.argv.includes('--ci-smoke')) {
    run(npm, ['exec', '--', 'playwright', 'test', 'tests/gameplay.spec.ts', '--grep', '300'], { ...process.env, BASE_URL: origin });
    const htmlResponse = await fetch(origin);
    if (!htmlResponse.ok) throw new Error(`Production entry returned ${htmlResponse.status}`);
    const html = await htmlResponse.text();
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      const url = new URL(reference, origin);
      if (url.origin !== origin) continue;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Production asset ${url.pathname} returned ${response.status}`);
    }
    const manifest = JSON.parse(await readFile('assets/runtime-manifest.json', 'utf8'));
    const criticalAssets = ['.glb', '.wav', '.png'].map((extension) => manifest.files.find((file) => file.path.endsWith(extension))).filter(Boolean);
    for (const file of criticalAssets) {
      const response = await fetch(new URL(`/${file.path}`, origin));
      if (!response.ok) throw new Error(`Runtime asset ${file.path} returned ${response.status}`);
      const data = await response.arrayBuffer();
      if (data.byteLength !== file.bytes) throw new Error(`Runtime asset ${file.path} size mismatch`);
    }
    checks.push('deterministic-math', 'production-http-and-runtime-assets');
  } else {
    run(npm, ['test'], { ...process.env, BASE_URL: origin });
    run(npm, ['run', 'test:audio'], { ...process.env, BASE_URL: origin }); checks.push('playwright-11-of-11');
    run(npm, ['run', 'test:camera'], { ...process.env, BASE_URL: origin }); checks.push('asymmetric-real-input-camera');
    run(npm, ['run', 'test:compat'], { ...process.env, BASE_URL: `${origin}/?qa=1`, REPORT_PATH: 'artifacts/reproduction/browser-compatibility.json' }); checks.push('three-browsers');
    run(npm, ['run', 'test:release'], { ...process.env, BASE_URL: origin, REPORT_PATH: 'artifacts/reproduction/release-smoke.json' }); checks.push('production-player-entry');
    run(process.execPath, ['scripts/inspect-threejs-canvas.mjs', '--manifest', 'artifacts/reproduction-manifest.json', '--seed', '42'], { ...process.env, BASE_URL: `${origin}/?qa=1` });
    run(process.execPath, ['scripts/check-evidence.mjs', 'artifacts/reproduction-manifest.json']); checks.push('desktop-mobile-pixels-and-budgets');
  }
  if (process.argv.includes('--full-race')) {
    run(npm, ['run', 'test:race'], { ...process.env, BASE_URL: `${origin}/?qa=1`, RUN_NAME: 'reproduction/full-race' });
    checks.push('full-two-lap-answer-only-race');
  }
  await mkdir('artifacts/reproduction', { recursive: true });
  const ciSmoke = process.argv.includes('--ci-smoke');
  await writeFile(ciSmoke ? 'artifacts/reproduction/ci-smoke-summary.json' : 'artifacts/reproduction/summary.json', `${JSON.stringify({ ok: true, origin, checks }, null, 2)}\n`);
  console.log(`\n${ciSmoke ? 'CI reproduction checks' : 'Local reproduction verification'} passed: ${checks.join(', ')}`);
} finally {
  server?.kill('SIGTERM');
}
