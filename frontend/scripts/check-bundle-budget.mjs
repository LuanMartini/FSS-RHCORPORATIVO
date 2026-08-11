import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const limitKb = Number(process.env.BUNDLE_CHUNK_LIMIT_KB ?? 300);
if (!Number.isFinite(limitKb) || limitKb <= 0) {
  throw new Error('BUNDLE_CHUNK_LIMIT_KB deve ser um numero positivo.');
}

const assetsDir = resolve('dist/assets');
const files = (await readdir(assetsDir)).filter((file) => file.endsWith('.js'));
const chunks = await Promise.all(files.map(async (file) => ({
  file,
  bytes: (await stat(resolve(assetsDir, file))).size,
})));
chunks.sort((left, right) => right.bytes - left.bytes);

console.log(`Orcamento por chunk JavaScript: ${limitKb.toFixed(0)} kB`);
for (const chunk of chunks) console.log(`${(chunk.bytes / 1000).toFixed(2)} kB\t${chunk.file}`);

const limitBytes = limitKb * 1000;
const oversized = chunks.filter((chunk) => chunk.bytes > limitBytes);
if (oversized.length > 0) {
  console.error(`Chunks acima do orcamento: ${oversized.map((chunk) => chunk.file).join(', ')}`);
  process.exitCode = 1;
}
