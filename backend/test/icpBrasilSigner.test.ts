import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { extractSignature } from '@signpdf/utils';
import { PDFDocument } from 'pdf-lib';
import { signPayslip } from '../src/payroll/infrastructure/payslipDocument.ts';
import {
  assinarCAdES,
  assinarPAdES,
  getIcpBrasilSignatureInfo,
  verifySimulatedCAdES,
  verifySimulatedPAdES,
} from '../src/security/icpBrasilSigner.ts';

const MANAGED_ENV = [
  'NODE_ENV', 'ICP_BRASIL_MODE', 'ICP_BRASIL_PROVIDER', 'ICP_BRASIL_PFX_PATH',
  'ICP_BRASIL_PFX_PASSWORD', 'ICP_BRASIL_SIMULATION_SECRET', 'ICP_BRASIL_OPENSSL_BIN',
] as const;
const execFileAsync = promisify(execFile);
let previousEnv: Partial<Record<(typeof MANAGED_ENV)[number], string>> = {};

function availableOpenSsl(): string | undefined {
  const candidates = [
    process.env.ICP_BRASIL_OPENSSL_BIN,
    'openssl',
    process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : undefined,
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore', windowsHide: true });
      return candidate;
    } catch {
      // Tenta a proxima instalacao conhecida.
    }
  }
  return undefined;
}

const testOpenSsl = availableOpenSsl();

beforeEach(() => {
  previousEnv = {};
  for (const key of MANAGED_ENV) {
    if (process.env[key] !== undefined) previousEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NODE_ENV = 'test';
  process.env.ICP_BRASIL_MODE = 'simulado';
  process.env.ICP_BRASIL_SIMULATION_SECRET = 'segredo-deterministico-de-teste';
});

afterEach(() => {
  for (const key of MANAGED_ENV) {
    const value = previousEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('modo simulado gera CAdES deterministica e verificavel em teste', async () => {
  const payload = Buffer.from('registro-de-ponto-0001', 'utf8');
  const first = await assinarCAdES(payload);
  const second = await assinarCAdES(payload);

  assert.deepEqual(first, second);
  assert.equal(verifySimulatedCAdES(payload, first), true);
  assert.equal(verifySimulatedCAdES(Buffer.from('conteudo-alterado'), first), false);
  assert.deepEqual(getIcpBrasilSignatureInfo('CAdES'), {
    mode: 'simulado', format: 'CAdES', profile: 'SIMULADO-HMAC-SHA256',
    algorithm: 'HMAC-SHA256', embedded: false,
  });
});

test('modo simulado gera PDF deterministico, valido para o verificador local', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');
  const first = await assinarPAdES(pdf);
  const second = await assinarPAdES(pdf);

  assert.deepEqual(first, second);
  assert.equal(first.subarray(0, pdf.length).equals(pdf), true);
  assert.equal(verifySimulatedPAdES(pdf, first), true);
  assert.equal(verifySimulatedPAdES(Buffer.from('%PDF-1.4\n%%EOF'), first), false);
});

test('contracheque persiste hash e estado do PDF final assinado', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');
  const result = await signPayslip(pdf);

  assert.equal(result.status, 'ASSINADO_SIMULADO');
  assert.equal(result.algorithm, 'SIMULADO-HMAC-SHA256/HMAC-SHA256');
  assert.equal(result.signatureBase64, null);
  assert.equal(result.sha256, createHash('sha256').update(result.document).digest('hex'));
  assert.equal(verifySimulatedPAdES(pdf, result.document), true);
});

test('modo producao sem certificado falha fechado com erro claro', async () => {
  process.env.NODE_ENV = 'production';
  process.env.ICP_BRASIL_MODE = 'producao';
  process.env.ICP_BRASIL_PROVIDER = 'a1';
  delete process.env.ICP_BRASIL_PFX_PATH;
  delete process.env.ICP_BRASIL_PFX_PASSWORD;

  await assert.rejects(
    assinarCAdES(Buffer.from('nao-pode-ser-assinado-sem-certificado')),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      const configuredError = error as Error & { status?: number; code?: string };
      assert.equal(configuredError.status, 500);
      assert.equal(configuredError.code, 'ICP_BRASIL_SIGNER_MISCONFIGURED');
      assert.match(configuredError.message, /ICP_BRASIL_PFX_PATH/);
      return true;
    },
  );
});

test('modo simulado e recusado quando NODE_ENV e production', async () => {
  process.env.NODE_ENV = 'production';
  process.env.ICP_BRASIL_MODE = 'simulado';

  await assert.rejects(
    assinarCAdES(Buffer.from('conteudo')),
    (error: unknown) => (error as { code?: string }).code === 'ICP_BRASIL_SIMULATION_FORBIDDEN',
  );
});

test('A1 temporario produz CAdES e PAdES verificaveis pelo OpenSSL', {
  skip: testOpenSsl ? false : 'OpenSSL nao esta instalado neste ambiente.',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-icp-test-'));
  const keyPath = join(directory, 'key.pem');
  const certificatePath = join(directory, 'certificate.pem');
  const pfxPath = join(directory, 'certificate.pfx');
  const payloadPath = join(directory, 'payload.bin');
  const signaturePath = join(directory, 'signature.p7s');
  const verifiedPath = join(directory, 'verified.bin');
  const padesSignaturePath = join(directory, 'pades-signature.p7s');
  const padesPayloadPath = join(directory, 'pades-payload.bin');
  const password = 'senha-descartavel-de-teste';
  try {
    await execFileAsync(testOpenSsl!, [
      'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certificatePath,
      '-days', '1', '-nodes', '-subj', '/C=BR/O=FSS Teste/CN=Certificado local descartavel',
    ], { windowsHide: true });
    await execFileAsync(testOpenSsl!, [
      'pkcs12', '-export', '-out', pfxPath, '-inkey', keyPath, '-in', certificatePath,
      '-passout', 'env:FSS_TEST_PFX_PASSWORD',
    ], { env: { ...process.env, FSS_TEST_PFX_PASSWORD: password }, windowsHide: true });

    process.env.ICP_BRASIL_MODE = 'producao';
    process.env.ICP_BRASIL_OPENSSL_BIN = testOpenSsl!;
    process.env.ICP_BRASIL_PROVIDER = 'a1';
    process.env.ICP_BRASIL_PFX_PATH = pfxPath;
    process.env.ICP_BRASIL_PFX_PASSWORD = password;
    const payload = Buffer.from('conteudo-binario-assinado-em-teste', 'utf8');
    const cades = await assinarCAdES(payload);
    await Promise.all([writeFile(payloadPath, payload), writeFile(signaturePath, cades)]);
    await execFileAsync(testOpenSsl!, [
      'cms', '-verify', '-cades', '-binary', '-inform', 'DER', '-in', signaturePath,
      '-content', payloadPath, '-CAfile', certificatePath, '-out', verifiedPath,
    ], { windowsHide: true });

    const pdfDocument = await PDFDocument.create();
    pdfDocument.addPage([300, 200]);
    const pdf = Buffer.from(await pdfDocument.save({ useObjectStreams: false }));
    const signedPdf = await assinarPAdES(pdf);
    const extracted = extractSignature(signedPdf) as { signature: string; signedData: Buffer };
    await Promise.all([
      writeFile(padesSignaturePath, Buffer.from(extracted.signature, 'binary')),
      writeFile(padesPayloadPath, extracted.signedData),
    ]);
    await execFileAsync(testOpenSsl!, [
      'cms', '-verify', '-cades', '-binary', '-inform', 'DER', '-in', padesSignaturePath,
      '-content', padesPayloadPath, '-CAfile', certificatePath, '-out', verifiedPath,
    ], { windowsHide: true });
    assert.equal(signedPdf.includes(Buffer.from('/SubFilter /ETSI.CAdES.detached')), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
