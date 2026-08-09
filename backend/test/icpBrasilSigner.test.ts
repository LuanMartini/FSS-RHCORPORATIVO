import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { IcpBrasilSigningError, signCades, signPades } from '../src/security/icpBrasilSigner.ts';

const require = createRequire(import.meta.url);

const ENV_KEYS = [
  'ICP_BRASIL_MODE', 'ICP_BRASIL_SIGNER', 'ICP_BRASIL_P12_PATH', 'ICP_BRASIL_P12_PASSWORD',
  'ICP_BRASIL_SIMULATION_SECRET', 'NODE_ENV',
] as const;

async function withEnvironment(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('assinaturas simuladas sao deterministicas e deixam o PDF original intacto', { concurrency: false }, async () => {
  await withEnvironment({ ICP_BRASIL_MODE: 'simulado', ICP_BRASIL_SIMULATION_SECRET: 'segredo-de-teste', NODE_ENV: 'test' }, async () => {
    const pdf = Buffer.from('%PDF-1.4\nconteudo de teste\n%%EOF', 'utf8');
    const first = await signPades(pdf);
    const second = await signPades(pdf);

    assert.deepEqual(first.document, pdf);
    assert.equal(first.sha256, createHash('sha256').update(pdf).digest('hex'));
    assert.equal(first.status, 'ASSINATURA_SIMULADA');
    assert.equal(first.algorithm, 'HMAC-SHA256-SIMULADO');
    assert.equal(first.signatureBase64, second.signatureBase64);

    const cades = await signCades(Buffer.from('{"nsr":1}', 'utf8'));
    assert.equal(cades.status, 'ASSINATURA_SIMULADA');
    assert.notEqual(cades.signatureBase64, first.signatureBase64);
  });
});

test('producao recusa assinatura sem certificado A1 configurado', { concurrency: false }, async () => {
  await withEnvironment({ ICP_BRASIL_MODE: 'producao', NODE_ENV: 'production' }, async () => {
    await assert.rejects(
      () => signCades(Buffer.from('registro de ponto', 'utf8')),
      (error: unknown) => error instanceof IcpBrasilSigningError && error.code === 'ICP_BRASIL_CERTIFICATE_REQUIRED',
    );
  });
});

test('producao recusa configuracao A3 sem adapter PKCS#11', { concurrency: false }, async () => {
  await withEnvironment({
    ICP_BRASIL_MODE: 'producao', ICP_BRASIL_SIGNER: 'pkcs11', NODE_ENV: 'production',
  }, async () => {
    await assert.rejects(
      () => signCades(Buffer.from('registro de ponto', 'utf8')),
      (error: unknown) => error instanceof IcpBrasilSigningError && error.code === 'ICP_BRASIL_PKCS11_NOT_CONFIGURED',
    );
  });
});

test('producao incorpora PAdES e gera CMS destacado com um P12 de homologacao local', { concurrency: false }, async () => {
  const forge = require('node-forge');
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024 });
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2025-01-01T00:00:00.000Z');
  certificate.validity.notAfter = new Date('2027-01-01T00:00:00.000Z');
  const subject = [{ name: 'commonName', value: 'RHCORPORATIVO teste local' }];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], 'senha-teste', { algorithm: '3des' });
  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-icp-'));
  const p12Path = join(directory, 'certificado.p12');
  await writeFile(p12Path, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
  try {
    await withEnvironment({
      ICP_BRASIL_MODE: 'producao', ICP_BRASIL_SIGNER: 'p12', ICP_BRASIL_P12_PATH: p12Path,
      ICP_BRASIL_P12_PASSWORD: 'senha-teste', NODE_ENV: 'production',
    }, async () => {
      const pdfDocument = await PDFDocument.create();
      pdfDocument.addPage([300, 200]).drawText('Contracheque de homologacao');
      const signed = await signPades(Buffer.from(await pdfDocument.save()));
      assert.equal(signed.status, 'ASSINADO_PADES');
      assert.equal(signed.signatureBase64, null);
      assert.match(signed.document.toString('latin1'), /ETSI\.CAdES\.detached/);
      assert.equal(signed.sha256, createHash('sha256').update(signed.document).digest('hex'));

      const cades = await signCades(Buffer.from('{"nsr":1}', 'utf8'));
      assert.equal(cades.status, 'ASSINADO_CADES');
      assert.ok(Buffer.from(cades.signatureBase64 ?? '', 'base64').length > 256);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
