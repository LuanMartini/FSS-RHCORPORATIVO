import { execFile } from 'node:child_process';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SignPdf, Signer } from '@signpdf/signpdf';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);
const SIMULATED_SECRET = 'FSS-RHCORPORATIVO-ICP-SIMULADO-V1';
const SIMULATED_PADES_MARKER = '\n% FSS-RHCORP-SIMULATED-PADES-V1 ';
const CHILD_SECRET_ENV = 'FSS_ICP_BRASIL_SECRET';

export type IcpBrasilMode = 'simulado' | 'producao';
export type IcpBrasilProfile = 'PAdES' | 'CAdES';

export interface A1Certificate {
  provider: 'a1';
  pfxPath: string;
  password: string;
  chainPath?: string;
}

export interface Pkcs11Certificate {
  provider: 'pkcs11';
  modulePath: string;
  keyUri: string;
  certificatePath: string;
  pin: string;
  providerName?: string;
  providerPath?: string;
  chainPath?: string;
}

export type IcpBrasilCertificate = A1Certificate | Pkcs11Certificate;

export interface IcpBrasilSignatureInfo {
  mode: IcpBrasilMode;
  format: 'PAdES' | 'CAdES';
  profile: 'SIMULADO-HMAC-SHA256' | 'PAdES-B-B' | 'CAdES-BES';
  algorithm: 'HMAC-SHA256' | 'RSA/ECDSA-SHA256';
  embedded: boolean;
}

export class IcpBrasilSigningError extends Error {
  readonly status = 500;
  readonly expose = true;

  constructor(message: string, readonly code: string, cause?: unknown) {
    super(message);
    this.name = 'IcpBrasilSigningError';
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause, enumerable: false });
  }
}

function configurationError(detail: string): IcpBrasilSigningError {
  return new IcpBrasilSigningError(
    `Assinatura ICP-Brasil indisponivel: ${detail}`,
    'ICP_BRASIL_SIGNER_MISCONFIGURED',
  );
}

export function getIcpBrasilMode(): IcpBrasilMode {
  const configured = process.env.ICP_BRASIL_MODE?.trim().toLowerCase();
  const mode = configured || (process.env.NODE_ENV === 'production' ? 'producao' : 'simulado');
  if (mode !== 'simulado' && mode !== 'producao') {
    throw configurationError('ICP_BRASIL_MODE deve ser simulado ou producao.');
  }
  if (process.env.NODE_ENV === 'production' && mode === 'simulado') {
    throw new IcpBrasilSigningError(
      'Assinatura simulada e proibida em producao.',
      'ICP_BRASIL_SIMULATION_FORBIDDEN',
    );
  }
  return mode;
}

export function getIcpBrasilSignatureInfo(format: IcpBrasilProfile): IcpBrasilSignatureInfo {
  const mode = getIcpBrasilMode();
  if (mode === 'simulado') {
    return { mode, format, profile: 'SIMULADO-HMAC-SHA256', algorithm: 'HMAC-SHA256', embedded: format === 'PAdES' };
  }
  return {
    mode,
    format,
    profile: format === 'PAdES' ? 'PAdES-B-B' : 'CAdES-BES',
    algorithm: 'RSA/ECDSA-SHA256',
    embedded: format === 'PAdES',
  };
}

function required(value: string | undefined, variable: string): string {
  const normalized = value?.trim();
  if (!normalized) throw configurationError(`configure ${variable}.`);
  return normalized;
}

export function resolveIcpBrasilCertificate(certificate?: IcpBrasilCertificate): IcpBrasilCertificate {
  if (certificate) return certificate;
  const provider = (process.env.ICP_BRASIL_PROVIDER ?? 'a1').trim().toLowerCase();
  if (provider === 'a1') {
    const chainPath = process.env.ICP_BRASIL_CERT_CHAIN_PATH?.trim();
    return {
      provider,
      pfxPath: required(process.env.ICP_BRASIL_PFX_PATH, 'ICP_BRASIL_PFX_PATH'),
      password: required(process.env.ICP_BRASIL_PFX_PASSWORD, 'ICP_BRASIL_PFX_PASSWORD'),
      ...(chainPath ? { chainPath } : {}),
    };
  }
  if (provider === 'pkcs11') {
    const providerName = process.env.ICP_BRASIL_PKCS11_PROVIDER?.trim();
    const providerPath = process.env.ICP_BRASIL_PKCS11_PROVIDER_PATH?.trim();
    const chainPath = process.env.ICP_BRASIL_CERT_CHAIN_PATH?.trim();
    return {
      provider,
      modulePath: required(process.env.ICP_BRASIL_PKCS11_MODULE, 'ICP_BRASIL_PKCS11_MODULE'),
      keyUri: required(process.env.ICP_BRASIL_PKCS11_KEY_URI, 'ICP_BRASIL_PKCS11_KEY_URI'),
      certificatePath: required(process.env.ICP_BRASIL_PKCS11_CERT_PATH, 'ICP_BRASIL_PKCS11_CERT_PATH'),
      pin: required(process.env.ICP_BRASIL_PKCS11_PIN, 'ICP_BRASIL_PKCS11_PIN'),
      ...(providerName ? { providerName } : {}),
      ...(providerPath ? { providerPath } : {}),
      ...(chainPath ? { chainPath } : {}),
    };
  }
  throw configurationError('ICP_BRASIL_PROVIDER deve ser a1 ou pkcs11.');
}

async function assertReadableFile(path: string, label: string): Promise<void> {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error('not a file');
  } catch (error) {
    throw configurationError(`${label} nao aponta para um arquivo legivel.`);
  }
}

function opensslBinary(): string {
  return process.env.ICP_BRASIL_OPENSSL_BIN?.trim() || 'openssl';
}

async function runOpenSsl(args: string[], secret?: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<void> {
  const timeout = Number(process.env.ICP_BRASIL_OPENSSL_TIMEOUT_MS ?? 30_000);
  try {
    await execFileAsync(opensslBinary(), args, {
      env: { ...process.env, ...extraEnv, ...(secret === undefined ? {} : { [CHILD_SECRET_ENV]: secret }) },
      timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    throw new IcpBrasilSigningError(
      'Nao foi possivel produzir a assinatura ICP-Brasil com o provedor configurado.',
      'ICP_BRASIL_SIGNING_FAILED',
      error,
    );
  }
}

async function validateCertificateFiles(certificate: IcpBrasilCertificate): Promise<void> {
  if (certificate.provider === 'a1') {
    if (!certificate.pfxPath.trim() || !certificate.password) throw configurationError('certificado A1 incompleto.');
    await assertReadableFile(certificate.pfxPath, 'ICP_BRASIL_PFX_PATH');
  } else {
    if (!certificate.modulePath.trim() || !certificate.keyUri.trim() || !certificate.certificatePath.trim() || !certificate.pin) {
      throw configurationError('configuracao PKCS#11 incompleta.');
    }
    await Promise.all([
      assertReadableFile(certificate.modulePath, 'ICP_BRASIL_PKCS11_MODULE'),
      assertReadableFile(certificate.certificatePath, 'ICP_BRASIL_PKCS11_CERT_PATH'),
    ]);
  }
  if (certificate.chainPath) await assertReadableFile(certificate.chainPath, 'ICP_BRASIL_CERT_CHAIN_PATH');
}

export async function assertIcpBrasilConfiguration(certificate?: IcpBrasilCertificate): Promise<void> {
  if (getIcpBrasilMode() === 'simulado') return;
  const resolved = resolveIcpBrasilCertificate(certificate);
  await validateCertificateFiles(resolved);
  await runOpenSsl(['version']);
}

function simulatedSignature(format: IcpBrasilProfile, payload: Buffer): Buffer {
  const secret = process.env.ICP_BRASIL_SIMULATION_SECRET || SIMULATED_SECRET;
  const contentSha256 = createHash('sha256').update(payload).digest('hex');
  const mac = createHmac('sha256', secret).update(`${format}\n${contentSha256}`).digest('hex');
  return Buffer.from(JSON.stringify({
    type: 'FSS-RHCORP-SIMULATED-SIGNATURE', version: 1, format,
    contentSha256, algorithm: 'HMAC-SHA256', signature: mac,
  }), 'utf8');
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifySimulatedCAdES(payload: Buffer, signature: Buffer): boolean {
  return safeEqual(simulatedSignature('CAdES', payload), signature);
}

export function verifySimulatedPAdES(pdf: Buffer, signedPdf: Buffer): boolean {
  const expected = Buffer.concat([
    pdf,
    Buffer.from(`${SIMULATED_PADES_MARKER}${simulatedSignature('PAdES', pdf).toString('base64url')}\n`, 'ascii'),
  ]);
  return safeEqual(expected, signedPdf);
}

function pkcs12Args(): string[] {
  return process.env.ICP_BRASIL_OPENSSL_PKCS12_LEGACY === 'true' ? ['-legacy'] : [];
}

function pdfSignatureLength(): number {
  const length = Number(process.env.ICP_BRASIL_PDF_SIGNATURE_LENGTH ?? 32_768);
  if (!Number.isSafeInteger(length) || length < 8_192 || length > 262_144) {
    throw configurationError('ICP_BRASIL_PDF_SIGNATURE_LENGTH deve estar entre 8192 e 262144 bytes.');
  }
  return length;
}

async function signWithA1(payload: Buffer, certificate: A1Certificate): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-icp-a1-'));
  const inputPath = join(directory, 'payload.bin');
  const outputPath = join(directory, 'signature.p7s');
  const signerPath = join(directory, 'signer.pem');
  const keyPath = join(directory, 'signer-key.pem');
  const embeddedChainPath = join(directory, 'embedded-chain.pem');
  try {
    await chmod(directory, 0o700).catch(() => undefined);
    await writeFile(inputPath, payload, { mode: 0o600 });
    const legacy = pkcs12Args();
    await runOpenSsl([
      'pkcs12', ...legacy, '-in', certificate.pfxPath, '-clcerts', '-nokeys',
      '-out', signerPath, '-passin', `env:${CHILD_SECRET_ENV}`,
    ], certificate.password);
    await runOpenSsl([
      'pkcs12', ...legacy, '-in', certificate.pfxPath, '-nocerts', '-nodes',
      '-out', keyPath, '-passin', `env:${CHILD_SECRET_ENV}`,
    ], certificate.password);
    await chmod(keyPath, 0o600).catch(() => undefined);
    await runOpenSsl([
      'pkcs12', ...legacy, '-in', certificate.pfxPath, '-cacerts', '-nokeys',
      '-out', embeddedChainPath, '-passin', `env:${CHILD_SECRET_ENV}`,
    ], certificate.password);
    const chain = await readFile(embeddedChainPath, 'utf8');
    const chainPath = certificate.chainPath ?? (chain.includes('BEGIN CERTIFICATE') ? embeddedChainPath : undefined);
    const cmsArgs = [
      'cms', '-sign', '-binary', '-in', inputPath, '-out', outputPath, '-outform', 'DER',
      '-signer', signerPath, '-inkey', keyPath, '-md', 'sha256', '-cades', '-nosmimecap',
      ...(chainPath ? ['-certfile', chainPath] : []),
    ];
    await runOpenSsl(cmsArgs);
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function signWithPkcs11(payload: Buffer, certificate: Pkcs11Certificate): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-icp-pkcs11-'));
  const inputPath = join(directory, 'payload.bin');
  const outputPath = join(directory, 'signature.p7s');
  try {
    await chmod(directory, 0o700).catch(() => undefined);
    await writeFile(inputPath, payload, { mode: 0o600 });
    const providerName = certificate.providerName ?? 'pkcs11';
    const args = [
      'cms', '-sign', '-binary', '-in', inputPath, '-out', outputPath, '-outform', 'DER',
      '-signer', certificate.certificatePath, '-inkey', certificate.keyUri,
      '-md', 'sha256', '-cades', '-nosmimecap',
      ...(certificate.chainPath ? ['-certfile', certificate.chainPath] : []),
      ...(certificate.providerPath ? ['-provider-path', certificate.providerPath] : []),
      '-provider', 'default', '-provider', providerName,
      '-passin', `env:${CHILD_SECRET_ENV}`,
    ];
    await runOpenSsl(args, certificate.pin, { PKCS11_MODULE_PATH: certificate.modulePath });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function productionCades(payload: Buffer, certificate?: IcpBrasilCertificate): Promise<Buffer> {
  const resolved = resolveIcpBrasilCertificate(certificate);
  await validateCertificateFiles(resolved);
  return resolved.provider === 'a1'
    ? signWithA1(payload, resolved)
    : signWithPkcs11(payload, resolved);
}

/**
 * Retorna apenas o certificado final em PEM. Esta primitiva e compartilhada
 * pelo XMLDSig do eSocial; cadeia e chave privada nunca sao embutidas no XML.
 */
export async function getIcpBrasilCertificatePem(certificate?: IcpBrasilCertificate): Promise<string> {
  if (getIcpBrasilMode() !== 'producao') {
    throw new IcpBrasilSigningError(
      'Certificado ICP-Brasil real e obrigatorio para XML eSocial.',
      'ICP_BRASIL_REAL_CERTIFICATE_REQUIRED',
    );
  }
  const resolved = resolveIcpBrasilCertificate(certificate);
  await validateCertificateFiles(resolved);
  if (resolved.provider === 'pkcs11') return readFile(resolved.certificatePath, 'utf8');

  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-icp-cert-'));
  const signerPath = join(directory, 'signer.pem');
  try {
    await chmod(directory, 0o700).catch(() => undefined);
    await runOpenSsl([
      'pkcs12', ...pkcs12Args(), '-in', resolved.pfxPath, '-clcerts', '-nokeys',
      '-out', signerPath, '-passin', `env:${CHILD_SECRET_ENV}`,
    ], resolved.password);
    return await readFile(signerPath, 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Assina bytes com RSA-SHA256 sem criar um envelope CMS/CAdES. */
export async function assinarRsaSha256(payload: Buffer, certificate?: IcpBrasilCertificate): Promise<Buffer> {
  if (!Buffer.isBuffer(payload) || payload.length === 0) {
    throw new IcpBrasilSigningError('Conteudo vazio nao pode ser assinado.', 'ICP_BRASIL_INVALID_PAYLOAD');
  }
  if (getIcpBrasilMode() !== 'producao') {
    throw new IcpBrasilSigningError(
      'Assinatura XML eSocial exige certificado ICP-Brasil real.',
      'ICP_BRASIL_REAL_CERTIFICATE_REQUIRED',
    );
  }
  const resolved = resolveIcpBrasilCertificate(certificate);
  await validateCertificateFiles(resolved);
  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-icp-rsa-'));
  const inputPath = join(directory, 'payload.bin');
  const outputPath = join(directory, 'signature.bin');
  const keyPath = join(directory, 'signer-key.pem');
  try {
    await chmod(directory, 0o700).catch(() => undefined);
    await writeFile(inputPath, payload, { mode: 0o600 });
    if (resolved.provider === 'a1') {
      await runOpenSsl([
        'pkcs12', ...pkcs12Args(), '-in', resolved.pfxPath, '-nocerts', '-nodes',
        '-out', keyPath, '-passin', `env:${CHILD_SECRET_ENV}`,
      ], resolved.password);
      await chmod(keyPath, 0o600).catch(() => undefined);
      await runOpenSsl(['dgst', '-sha256', '-sign', keyPath, '-out', outputPath, inputPath]);
    } else {
      const providerName = resolved.providerName ?? 'pkcs11';
      await runOpenSsl([
        'dgst', '-sha256', '-sign', resolved.keyUri, '-out', outputPath,
        ...(resolved.providerPath ? ['-provider-path', resolved.providerPath] : []),
        '-provider', 'default', '-provider', providerName,
        '-passin', `env:${CHILD_SECRET_ENV}`, inputPath,
      ], resolved.pin, { PKCS11_MODULE_PATH: resolved.modulePath });
    }
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

class OpenSslCadesSigner extends Signer {
  constructor(private readonly certificate?: IcpBrasilCertificate) {
    super();
  }

  override async sign(payload: Buffer): Promise<Buffer> {
    return productionCades(payload, this.certificate);
  }
}

export async function assinarCAdES(payload: Buffer, certificate?: IcpBrasilCertificate): Promise<Buffer> {
  if (!Buffer.isBuffer(payload) || payload.length === 0) {
    throw new IcpBrasilSigningError('Conteudo vazio nao pode ser assinado.', 'ICP_BRASIL_INVALID_PAYLOAD');
  }
  return getIcpBrasilMode() === 'simulado'
    ? simulatedSignature('CAdES', payload)
    : productionCades(payload, certificate);
}

export async function assinarPAdES(pdf: Buffer, certificate?: IcpBrasilCertificate): Promise<Buffer> {
  if (!Buffer.isBuffer(pdf) || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new IcpBrasilSigningError('Documento informado nao e um PDF valido.', 'ICP_BRASIL_INVALID_PDF');
  }
  if (getIcpBrasilMode() === 'simulado') {
    return Buffer.concat([
      pdf,
      Buffer.from(`${SIMULATED_PADES_MARKER}${simulatedSignature('PAdES', pdf).toString('base64url')}\n`, 'ascii'),
    ]);
  }

  try {
    const signingTime = new Date();
    const pdfDocument = await PDFDocument.load(pdf, { updateMetadata: false });
    pdflibAddPlaceholder({
      pdfDoc: pdfDocument,
      reason: process.env.ICP_BRASIL_SIGNATURE_REASON?.trim() || 'Contracheque emitido pelo FSS RH Corporativo',
      contactInfo: process.env.ICP_BRASIL_SIGNER_CONTACT?.trim() || '',
      name: process.env.ICP_BRASIL_SIGNER_NAME?.trim() || 'FSS RH Corporativo',
      location: process.env.ICP_BRASIL_SIGNER_LOCATION?.trim() || 'Brasil',
      signingTime,
      signatureLength: pdfSignatureLength(),
      subFilter: SUBFILTER_ETSI_CADES_DETACHED,
      appName: 'FSS RH Corporativo',
    });
    const withPlaceholder = Buffer.from(await pdfDocument.save({ useObjectStreams: false }));
    return await new SignPdf().sign(withPlaceholder, new OpenSslCadesSigner(certificate), signingTime);
  } catch (error) {
    if (error instanceof IcpBrasilSigningError) throw error;
    throw new IcpBrasilSigningError(
      'Nao foi possivel produzir a assinatura PAdES ICP-Brasil.',
      'ICP_BRASIL_SIGNING_FAILED',
      error,
    );
  }
}
