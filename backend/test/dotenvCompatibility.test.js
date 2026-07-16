import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDirectory = path.resolve(backendDirectory, '..');

test('dotenv 17 carrega todas as variaveis documentadas em DEPLOY.md', async () => {
  const deploy = await readFile(path.join(repositoryDirectory, 'DEPLOY.md'), 'utf8');
  const keys = [...new Set(
    [...deploy.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
  )];
  assert.ok(keys.length > 0, 'DEPLOY.md deve documentar pelo menos uma variavel de ambiente');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'rhcorp-dotenv-'));
  const envPath = path.join(directory, '.env');
  const expected = Object.fromEntries(keys.map((key) => [
    key,
    key === 'DOTENV_CONFIG_QUIET' ? 'true' : `smoke-${key}-#-ok`,
  ]));

  try {
    await writeFile(
      envPath,
      Object.entries(expected).map(([key, value]) => `${key}="${value}"`).join('\n'),
      'utf8',
    );

    const cleanEnvironment = { ...process.env };
    for (const key of keys) delete cleanEnvironment[key];
    cleanEnvironment.DOTENV_CONFIG_PATH = envPath;
    cleanEnvironment.DOTENV_CONFIG_QUIET = 'true';

    const probe = [
      "import 'dotenv/config';",
      `const keys = ${JSON.stringify(keys)};`,
      'process.stdout.write(JSON.stringify(Object.fromEntries(keys.map((key) => [key, process.env[key]]))));',
    ].join('\n');
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--input-type=module', '--eval', probe],
      { cwd: backendDirectory, env: cleanEnvironment },
    );

    assert.equal(stderr, '');
    assert.deepEqual(JSON.parse(stdout), expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
