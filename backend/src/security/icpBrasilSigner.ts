import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SignPdf } from '@signpdf/signpdf';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { P12Signer } from '@signpdf/signer-p12';
import { SUBFILTER_ETSI_CADES_DETACHED } from '@signpdf/utils';
import { PDFDocument } from 'pdf-lib';

export type IcpBrasilMode = 'simulado' | 'producao';

export type IcpBrasilSignature = {
  document: Buffer;
  sha256: string;
  status: 'ASSINATURA_SIMULADA' | 'ASSINADO_PADES' | 'ASSINADO_CADES';
  algorithm: string;
  signatureBase64: string | null;
};

export class IcpBrasilSigningError extends Error {
  constructor(
    message: string,
    readonly code: 'ICP_BRASIL_MODE_INVALID' | 'ICP_BRASIL_CERTIFICATE_REQUIRED' | 'ICP_BRASIL_PKCS11_NOT_CONFIGURED' | 'ICP_BRASIL_SIGNING_FAILED',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'IcpBrasilSigningError';
  }
}

function configuredMode(): IcpBrasilMode {
  const mode = process.env.ICP_BRASIL_MODE ?? 'simulado';
  if (mode === 'simulado') {
    if (process.env.NODE_ENV === 'production') {
      throw new IcpBrasilSigningError(
        'ICP_BRASIL_MODE=producao e obrigatorio em producao.',
        'ICP_BRASIL_CERTIFICATE_REQUIRED',
      );
    }
    return mode;
  }
  if (mode === 'producao') return mode;
  throw new IcpBrasilSigningError('ICP_BRASIL_MODE deve ser simulado ou producao.', 'ICP_BRASIL_MODE_INVALID');
}

function simulationSignature(kind: 'PAdES' | 'CAdES', payload: Buffer): IcpBrasilSignature {
  const secret = process.env.ICP_BRASIL_SIMULATION_SECRET ?? 'rhcorp-icp-brasil-simulacao-v1';
  const signatureBase64 = createHmac('sha256', secret).update(kind).update(payload).digest('base64');
  return {
    document: payload,
    sha256: createHash('sha256').update(payload).digest('hex'),
    status: 'ASSINATURA_SIMULADA',
    algorithm: 'HMAC-SHA256-SIMULADO',
    signatureBase64,
  };
}

async function productionP12Signer(): Promise<P12Signer> {
  const signerType = process.env.ICP_BRASIL_SIGNER ?? 'p12';
  if (signerType === 'pkcs11') {
    throw new IcpBrasilSigningError(
      'Assinador PKCS#11 (A3/HSM) ainda nao foi configurado neste ambiente.',
      'ICP_BRASIL_PKCS11_NOT_CONFIGURED',
    );
  }
  if (signerType !== 'p12') {
    throw new IcpBrasilSigningError('ICP_BRASIL_SIGNER deve ser p12 ou pkcs11.', 'ICP_BRASIL_CERTIFICATE_REQUIRED');
  }
  const certificatePath = process.env.ICP_BRASIL_P12_PATH?.trim();
  if (!certificatePath || process.env.ICP_BRASIL_P12_PASSWORD === undefined) {
    throw new IcpBrasilSigningError(
      'Certificado A1 ausente. Configure ICP_BRASIL_P12_PATH e ICP_BRASIL_P12_PASSWORD.',
      'ICP_BRASIL_CERTIFICATE_REQUIRED',
    );
  }
  try {
    return new P12Signer(await readFile(certificatePath), { passphrase: process.env.ICP_BRASIL_P12_PASSWORD });
  } catch (cause) {
    throw new IcpBrasilSigningError(
      'Nao foi possivel carregar o certificado A1 configurado para ICP-Brasil.',
      'ICP_BRASIL_CERTIFICATE_REQUIRED',
      { cause },
    );
  }
}

function signatureLength(): number {
  const configured = Number(process.env.ICP_BRASIL_SIGNATURE_LENGTH ?? 16384);
  if (!Number.isSafeInteger(configured) || configured < 8192 || configured > 65536) {
    throw new IcpBrasilSigningError('ICP_BRASIL_SIGNATURE_LENGTH deve estar entre 8192 e 65536.', 'ICP_BRASIL_SIGNING_FAILED');
  }
  return configured;
}

/** Assina PDF com PAdES usando um certificado A1 configurado no ambiente. */
export async function signPades(pdf: Buffer): Promise<IcpBrasilSignature> {
  if (configuredMode() === 'simulado') return simulationSignature('PAdES', pdf);
  try {
    const pdfDocument = await PDFDocument.load(pdf, { ignoreEncryption: true });
    pdflibAddPlaceholder({
      pdfDoc: pdfDocument,
      reason: process.env.ICP_BRASIL_SIGNATURE_REASON ?? 'Assinatura de documento corporativo',
      contactInfo: process.env.ICP_BRASIL_SIGNATURE_CONTACT ?? '',
      name: process.env.ICP_BRASIL_SIGNATURE_NAME ?? 'RHCORPORATIVO',
      location: process.env.ICP_BRASIL_SIGNATURE_LOCATION ?? 'Brasil',
      signatureLength: signatureLength(),
      subFilter: SUBFILTER_ETSI_CADES_DETACHED,
      appName: 'RHCORPORATIVO',
    });
    const preparedPdf = Buffer.from(await pdfDocument.save({ useObjectStreams: false }));
    const signedPdf = await new SignPdf().sign(preparedPdf, await productionP12Signer(), new Date());
    return {
      document: signedPdf,
      sha256: createHash('sha256').update(signedPdf).digest('hex'),
      status: 'ASSINADO_PADES',
      algorithm: 'PAdES/ETSI.CAdES.detached/SHA-256',
      signatureBase64: null,
    };
  } catch (error) {
    if (error instanceof IcpBrasilSigningError) throw error;
    throw new IcpBrasilSigningError('Falha ao aplicar assinatura PAdES ICP-Brasil no PDF.', 'ICP_BRASIL_SIGNING_FAILED', { cause: error });
  }
}

/** Produz CMS/PKCS#7 destacado para o payload canÃ´nico do registro de ponto. */
export async function signCades(payload: Buffer): Promise<IcpBrasilSignature> {
  if (configuredMode() === 'simulado') return simulationSignature('CAdES', payload);
  try {
    const signature = await (await productionP12Signer()).sign(payload, new Date());
    return {
      document: payload,
      sha256: createHash('sha256').update(payload).digest('hex'),
      status: 'ASSINADO_CADES',
      algorithm: 'CMS/PKCS#7-detached/SHA-256',
      signatureBase64: signature.toString('base64'),
    };
  } catch (error) {
    if (error instanceof IcpBrasilSigningError) throw error;
    throw new IcpBrasilSigningError('Falha ao gerar assinatura CAdES ICP-Brasil.', 'ICP_BRASIL_SIGNING_FAILED', { cause: error });
  }
}
