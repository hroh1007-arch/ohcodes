import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['.git', 'node_modules', 'dist', 'SOURCE_MANIFEST.json']);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.name === '.DS_Store') return [];
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Do not package symlinks');
    return entry.isDirectory() ? files(path) : [path];
  });
}
const manifest = {
  sourceCommit: 'fc70a4604298f24d942f6fc8986a15c124f92b16',
  hashAlgorithm: 'sha256',
  files: Object.fromEntries(files(root).sort().map((path) => [
    relative(root, path).split(sep).join('/'),
    createHash('sha256').update(readFileSync(path)).digest('hex'),
  ])),
};
const target = join(root, 'SOURCE_MANIFEST.json');
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== serialized) throw new Error('Source manifest differs; inspect changes and run npm run manifest');
  console.log(`Verified ${Object.keys(manifest.files).length} package files.`);
} else {
  writeFileSync(target, serialized);
  console.log(`Recorded ${Object.keys(manifest.files).length} package files.`);
}
