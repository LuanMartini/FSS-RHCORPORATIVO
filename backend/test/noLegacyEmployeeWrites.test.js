import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const writeToLegacyEmployees = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+funcionarios\b/i;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'db' ? [] : sourceFiles(target);
    return /\.(?:js|ts)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

test('rotas e servicos nao gravam diretamente na tabela legada funcionarios', async () => {
  const violations = [];
  for (const file of await sourceFiles(sourceDirectory)) {
    const source = await readFile(file, 'utf8');
    if (writeToLegacyEmployees.test(source)) violations.push(path.relative(sourceDirectory, file));
  }
  assert.deepEqual(violations, []);
});
