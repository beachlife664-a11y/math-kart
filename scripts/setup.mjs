import { spawnSync } from 'node:child_process';

const [major, minor] = process.versions.node.split('.').map(Number);
if (!(major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19))) {
  throw new Error(`Node.js ^20.19.0 or >=22.12.0 is required; current: ${process.versions.node}`);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
}

run(process.execPath, ['scripts/verify-assets.mjs']);
run(npm, ['ci', '--no-audit', '--no-fund']);
if (process.argv.includes('--with-tests')) run(npx, ['playwright', 'install', '--no-shell', 'chromium', 'firefox', 'webkit']);
run(npm, ['run', 'build']);
run(npm, ['run', 'prepare:preview']);
console.log('\nSetup complete. Run "npm run preview:static" and open http://127.0.0.1:28474/');
