import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseHierarchyChange, parseValidationDecision } from '../src/core/domain/contracts.js';
import { generateEmploymentContract } from '../src/core/infrastructure/pdfGenerator.js';

test('exige justificativa consistente para recusar documento', () => {
  assert.throws(
    () => parseValidationDecision({ decision: 'RECUSADO', justificativa: 'nao' }),
    /pelo menos 5 caracteres/
  );
  assert.deepEqual(
    parseValidationDecision({ decision: 'RECUSADO', justificativa: 'Documento ilegivel' }),
    { decision: 'RECUSADO', justification: 'Documento ilegivel' }
  );
});

test('contrato dinamico produz um PDF valido sem expor caracteres de controle', () => {
  const pdf = generateEmploymentContract({
    nome_completo: 'Joao (Teste)', cpf: '12345678901', cargo_nome: 'Analista',
    departamento_nome: 'RH', salario: 4500, data_admissao: '2026-07-14',
  });
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.equal(pdf.toString('ascii').includes('Joao \\(Teste\\)'), true);
  assert.match(pdf.toString('ascii'), /%%EOF$/);
});

test('valida contrato estrito da alteracao hierarquica', () => {
  assert.deepEqual(
    parseHierarchyChange({ cargoId: '3' }, { novoSuperiorId: 1, motivo: 'Reorganizacao anual', versao: 2 }),
    { cargoId: 3, newSuperiorId: 1, reason: 'Reorganizacao anual', version: 2 }
  );
  assert.throws(() => parseHierarchyChange({ cargoId: 'x' }, {}), /Cargo invalido/);
});

test('storage usa AES-GCM e detecta adulteracao do ciphertext', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rhcorp-storage-'));
  process.env.SECURE_STORAGE_PATH = directory;
  const storage = await import('../src/core/infrastructure/encryptedFileStorage.js');
  try {
    const original = Buffer.from('conteudo sensivel do colaborador');
    const key = await storage.saveEncrypted(original);
    const encrypted = await readFile(path.join(directory, key));
    assert.equal(encrypted.includes(original), false);
    assert.deepEqual(await storage.readDecrypted(key), original);

    encrypted[encrypted.length - 1] ^= 1;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(directory, key), encrypted);
    await assert.rejects(() => storage.readDecrypted(key));
  } finally {
    delete process.env.SECURE_STORAGE_PATH;
    await rm(directory, { recursive: true, force: true });
  }
});
