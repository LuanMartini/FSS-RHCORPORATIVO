import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetDirectory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const maxRouteChunkBytes = 300 * 1024;
const routeChunkPatterns = [/^index-.*\.js$/, /^AuditoriaAnalytics-.*\.js$/];
const assetNames = await readdir(assetDirectory);
const checkedAssets = assetNames.filter((name) => routeChunkPatterns.some((pattern) => pattern.test(name)));

if (checkedAssets.length !== routeChunkPatterns.length) {
  throw new Error('Build incompleto: os chunks de rota esperados não foram encontrados. Execute npm run build antes da validação.');
}

const oversized = [];
for (const name of checkedAssets) {
  const bytes = (await stat(join(assetDirectory, name))).size;
  const kib = (bytes / 1024).toFixed(1);
  process.stdout.write(`${name}: ${kib} KiB\n`);
  if (bytes > maxRouteChunkBytes) oversized.push(`${name} (${kib} KiB)`);
}

if (oversized.length) {
  throw new Error(`Orçamento de 300 KiB excedido: ${oversized.join(', ')}`);
}
