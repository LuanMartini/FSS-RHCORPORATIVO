import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const runtimeRoot = new URL('../src/', import.meta.url);
const directLegacyMutation = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+(?:(?:"?public"?)\.)?"?funcionarios"?\b/giu;

async function runtimeSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const location = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) return runtimeSources(location);
    return /\.(?:js|ts)$/u.test(entry.name) ? [location] : [];
  }));
  return nested.flat();
}

test('runtime do backend nao executa DML direto em funcionarios', async () => {
  const violations = [];
  for (const source of await runtimeSources(runtimeRoot)) {
    const content = await readFile(source, 'utf8');
    for (const match of content.matchAll(directLegacyMutation)) {
      const line = content.slice(0, match.index).split('\n').length;
      violations.push(`${source.pathname}:${line}: ${match[0]}`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `DML direto na tabela legada detectado:\n${violations.join('\n')}`,
  );
});
