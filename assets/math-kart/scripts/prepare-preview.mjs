import { cp, mkdir, rm } from 'node:fs/promises';

await cp('public', 'dist/output', { recursive: true });
await rm('dist/preview', { recursive: true, force: true });
await mkdir('dist/preview', { recursive: true });
await cp('dist/output', 'dist/preview', { recursive: true });
await cp('dist/output_resource/assets', 'dist/preview/assets', { recursive: true });
console.log('Static preview ready: dist/preview');
