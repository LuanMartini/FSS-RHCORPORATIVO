import { createRequire } from 'node:module';
import { PDFParse } from 'pdf-parse';

const nodeRequire = createRequire(import.meta.url);
const { createWorker, PSM } = nodeRequire('tesseract.js') as typeof import('tesseract.js');
const portugueseData = nodeRequire('@tesseract.js-data/por') as { langPath: string; gzip: boolean };

const DEFAULT_MANUAL_REVIEW_THRESHOLD = 85;
const MAX_PDF_PAGES = 2;

export type OcrDocumentType = 'RG' | 'CPF' | 'PIS' | 'COMPROVANTE_RESIDENCIA' | 'DIPLOMA' | 'RECIBO';
export type OcrErrorCode = 'OCR_PROVIDER_UNAVAILABLE' | 'OCR_DOCUMENT_INVALID';

export interface OcrResult {
  metadata: Record<string, unknown>;
  confidence: number;
  provider: 'TESSERACT_LOCAL_V1' | 'OCR_SIMULADO_DEV_ONLY_V1';
  requiresManualReview: boolean;
}

export class OcrProviderError extends Error {
  constructor(message: string, readonly code: OcrErrorCode) {
    super(message);
    this.name = 'OcrProviderError';
  }
}

let workerPromise: Promise<import('tesseract.js').Worker> | undefined;
let pendingRecognition = Promise.resolve();
let simulationWarningEmitted = false;

function manualReviewThreshold(): number {
  const configured = String(process.env.OCR_MANUAL_REVIEW_THRESHOLD ?? '').trim();
  if (!configured) return DEFAULT_MANUAL_REVIEW_THRESHOLD;
  const threshold = Number(configured);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new OcrProviderError('OCR_MANUAL_REVIEW_THRESHOLD deve estar entre 0 e 100.', 'OCR_PROVIDER_UNAVAILABLE');
  }
  return threshold;
}

function selectedProvider(): 'tesseract' | 'simulado' {
  const configured = String(process.env.OCR_PROVIDER ?? '').trim().toLowerCase();
  if (configured === 'tesseract' || configured === 'local') return 'tesseract';
  if (configured === 'simulado' || (!configured && process.env.NODE_ENV !== 'production')) {
    if (process.env.NODE_ENV === 'production') {
      throw new OcrProviderError('OCR_PROVIDER=tesseract deve ser configurado em producao.', 'OCR_PROVIDER_UNAVAILABLE');
    }
    if (!simulationWarningEmitted) {
      process.emitWarning('OCR simulado ativo somente para desenvolvimento/teste; nenhum dado e extraido do documento.', {
        code: 'OCR_SIMULATED_DEV_ONLY', type: 'Warning',
      });
      simulationWarningEmitted = true;
    }
    return 'simulado';
  }
  if (!configured) throw new OcrProviderError('OCR_PROVIDER=tesseract deve ser configurado em producao.', 'OCR_PROVIDER_UNAVAILABLE');
  throw new OcrProviderError(`Provedor OCR "${configured}" nao esta disponivel nesta implantacao.`, 'OCR_PROVIDER_UNAVAILABLE');
}

async function serializeRecognition<T>(work: () => Promise<T>): Promise<T> {
  const previous = pendingRecognition;
  let release: () => void = () => {};
  pendingRecognition = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await work(); }
  finally { release(); }
}

async function localWorker(): Promise<import('tesseract.js').Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('por', 1, {
      langPath: portugueseData.langPath, gzip: portugueseData.gzip, cacheMethod: 'none',
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      });
      return worker;
    }).catch((error: unknown) => {
      workerPromise = undefined;
      throw new OcrProviderError('Provedor local de OCR indisponivel.', 'OCR_PROVIDER_UNAVAILABLE');
    });
  }
  return workerPromise;
}

async function imagesForOcr(buffer: Buffer, mimeType: string): Promise<Buffer[]> {
  if (mimeType !== 'application/pdf') return [buffer];
  const parser = new PDFParse({ data: buffer });
  try {
    const screenshots = await parser.getScreenshot({ first: MAX_PDF_PAGES, scale: 1.7, imageBuffer: true, imageDataUrl: false });
    if (screenshots.pages.length === 0) throw new Error('PDF sem paginas renderizaveis.');
    return screenshots.pages.map((page) => Buffer.from(page.data));
  } catch (error) {
    if (error instanceof OcrProviderError) throw error;
    throw new OcrProviderError('Nao foi possivel preparar o PDF para OCR.', 'OCR_DOCUMENT_INVALID');
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function recognizeLocally(buffer: Buffer, mimeType: string): Promise<{ text: string; confidence: number }> {
  const images = await imagesForOcr(buffer, mimeType);
  const worker = await localWorker();
  return serializeRecognition(async () => {
    const pages = await Promise.all(images.map(async (image) => worker.recognize(image)));
    const text = pages.map((page) => page.data.text).join('\n').trim();
    const confidence = pages.length === 0 ? 0 : pages.reduce((total, page) => total + Number(page.data.confidence || 0), 0) / pages.length;
    return { text, confidence: Math.max(0, Math.min(100, Number(confidence.toFixed(2)))) };
  });
}

function lines(text: string): string[] {
  return text.replace(/\r/g, '').split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function labelValue(text: string, label: string): string | null {
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:\\-]?\\s*([^\\n]+)`, 'im'));
  return match?.[1]?.trim() || null;
}

function onlyDigits(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits || null;
}

function cpfFrom(text: string): string | null {
  const labeled = onlyDigits(labelValue(text, 'CPF'));
  if (labeled && labeled.length === 11) return labeled;
  const match = text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/);
  return onlyDigits(match?.[0] ?? null);
}

function cnpjFrom(text: string): string | null {
  const labeled = onlyDigits(labelValue(text, 'CNPJ'));
  if (labeled && labeled.length === 14) return labeled;
  const match = text.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/-]?\d{4}[-\s]?\d{2}\b/);
  return onlyDigits(match?.[0] ?? null);
}

function dateFrom(text: string): string | null {
  const match = text.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](20\d{2})\b/) ?? text.match(/\b(20\d{2})[\/.\-](\d{2})[\/.\-](\d{2})\b/);
  if (!match) return null;
  const iso = match[1]?.startsWith('20') ? `${match[1]}-${match[2]}-${match[3]}` : `${match[3]}-${match[2]}-${match[1]}`;
  return Number.isNaN(Date.parse(`${iso}T12:00:00Z`)) ? null : iso;
}

function amountFrom(text: string): number | null {
  const match = text.match(/(?:R\$|RS|VALOR\s*:?\s*(?:R\$)?)\s*(\d{1,3}(?:[.\s]\d{3})*[,\.]\d{2})/i);
  if (!match?.[1]) return null;
  const normalized = match[1].replace(/[.\s](?=\d{3}(?:[,\.]|$))/g, '').replace(',', '.');
  const amount = Number(normalized);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function categoryFromText(text: string): string {
  const normalized = text.toLowerCase();
  if (/uber|\b99\b|taxi|mobilidade|transporte/.test(normalized)) return 'MOBILIDADE';
  if (/passagem|aereo|voo|onibus|rodovi/.test(normalized)) return 'PASSAGEM';
  if (/restaurante|aliment|refeic/.test(normalized)) return 'ALIMENTACAO';
  if (/hotel|hosped/.test(normalized)) return 'HOSPEDAGEM';
  if (/saude|farmacia|medic/.test(normalized)) return 'SAUDE';
  if (/curso|educa|livro/.test(normalized)) return 'EDUCACAO';
  return 'OUTROS';
}

function merchantFrom(text: string): string | null {
  const explicit = labelValue(text, '(?:FORNECEDOR|ESTABELECIMENTO|LOJA|EMITENTE)');
  if (explicit) return explicit.slice(0, 180);
  const candidate = lines(text).find((line) => /[A-Za-zÀ-ÿ]{3}/.test(line) && !/CNPJ|CPF|DATA|VALOR|RECIBO|CUPOM|NOTA FISCAL/i.test(line));
  if (candidate) return candidate.replace(/^(?:RECIBO|CUPOM|NOTA FISCAL)\s*[-:]?\s*/i, '').slice(0, 180) || null;
  const receiptTitle = lines(text).find((line) => /(?:RECIBO|CUPOM|NOTA FISCAL)/i.test(line));
  return receiptTitle?.replace(/^(?:RECIBO|CUPOM|NOTA FISCAL)\s*[-:]?\s*/i, '').trim().slice(0, 180) || null;
}

function metadataFor(type: OcrDocumentType, text: string, provider: OcrResult['provider']): Record<string, unknown> {
  const base = { processadoPor: provider, textoDetectado: Boolean(text.trim()) };
  if (type === 'CPF') return { ...base, cpf: cpfFrom(text) };
  if (type === 'RG') return {
    ...base,
    numero: onlyDigits(labelValue(text, 'RG')) ?? onlyDigits(text.match(/\b\d{2}[.]?\d{3}[.]?\d{3}[-\s]?\d\b/)?.[0] ?? null),
    orgaoEmissor: labelValue(text, '(?:ORGAO EMISSOR|EMISSOR)')?.slice(0, 80) ?? null,
    uf: labelValue(text, 'UF')?.match(/\b[A-Z]{2}\b/i)?.[0]?.toUpperCase() ?? null,
  };
  if (type === 'PIS') return { ...base, pis: onlyDigits(labelValue(text, 'PIS'))?.slice(0, 11) ?? null };
  if (type === 'COMPROVANTE_RESIDENCIA') return {
    ...base,
    logradouro: labelValue(text, '(?:ENDERECO|LOGRADOURO)')?.slice(0, 180) ?? null,
    cep: text.match(/\b\d{5}-?\d{3}\b/)?.[0] ?? null,
  };
  if (type === 'DIPLOMA') return {
    ...base,
    instituicao: labelValue(text, '(?:INSTITUICAO|UNIVERSIDADE|FACULDADE)')?.slice(0, 180) ?? null,
    curso: labelValue(text, 'CURSO')?.slice(0, 180) ?? null,
    conclusao: labelValue(text, '(?:CONCLUSAO|CONCLUIDO EM|ANO)')?.match(/\b20\d{2}\b/)?.[0] ?? null,
  };
  return {
    ...base,
    cnpj: cnpjFrom(text), date: dateFrom(text), amountCents: amountFrom(text),
    category: categoryFromText(text), merchant: merchantFrom(text),
  };
}

function completeMetadata(type: OcrDocumentType, metadata: Record<string, unknown>): boolean {
  if (type === 'CPF') return typeof metadata.cpf === 'string';
  if (type === 'RG') return typeof metadata.numero === 'string';
  if (type === 'PIS') return typeof metadata.pis === 'string';
  if (type === 'COMPROVANTE_RESIDENCIA') return typeof metadata.logradouro === 'string' && typeof metadata.cep === 'string';
  if (type === 'DIPLOMA') return typeof metadata.instituicao === 'string' && typeof metadata.curso === 'string';
  return typeof metadata.amountCents === 'number' && typeof metadata.date === 'string' && metadata.category !== 'OUTROS';
}

function simulatedResult(type: OcrDocumentType): OcrResult {
  const provider: OcrResult['provider'] = 'OCR_SIMULADO_DEV_ONLY_V1';
  const metadata = metadataFor(type, '', provider);
  return { metadata, confidence: 0, provider, requiresManualReview: true };
}

export async function extractDocument(buffer: Buffer, mimeType: string, type: OcrDocumentType): Promise<OcrResult> {
  if (selectedProvider() === 'simulado') return simulatedResult(type);
  try {
    const recognized = await recognizeLocally(buffer, mimeType);
    const provider: OcrResult['provider'] = 'TESSERACT_LOCAL_V1';
    const metadata = metadataFor(type, recognized.text, provider);
    return {
      metadata,
      confidence: recognized.confidence,
      provider,
      requiresManualReview: recognized.confidence < manualReviewThreshold() || !completeMetadata(type, metadata),
    };
  } catch (error) {
    if (error instanceof OcrProviderError) throw error;
    throw new OcrProviderError('Falha ao processar o documento com OCR local.', 'OCR_DOCUMENT_INVALID');
  }
}

export async function terminateLocalOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = undefined;
  if (!pending) return;
  const worker = await pending.catch(() => undefined);
  await worker?.terminate();
}
