import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { parseResumeText } from '../domain/matchEngine.js';
import type { ParsedResume } from '../domain/types.js';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function validateResumeFile(buffer: Buffer, mime: string, size: number): void {
  if (size <= 0 || size > 5 * 1024 * 1024) throw Object.assign(new Error('Curriculo deve ter entre 1 byte e 5 MB.'), { status: 400 });
  if (![PDF_MIME, DOCX_MIME].includes(mime)) throw Object.assign(new Error('Envie um curriculo PDF ou DOCX.'), { status: 415 });
  if (mime === PDF_MIME && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw Object.assign(new Error('Assinatura do arquivo PDF invalida.'), { status: 400 });
  if (mime === DOCX_MIME && buffer.subarray(0, 2).toString('ascii') !== 'PK') throw Object.assign(new Error('Assinatura do arquivo DOCX invalida.'), { status: 400 });
}

export async function extractResumeText(buffer: Buffer, mime: string): Promise<string> {
  if (mime === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function parseResume(buffer: Buffer, mime: string): Promise<{ text: string; profile: ParsedResume }> {
  const text = await extractResumeText(buffer, mime);
  if (text.trim().length < 20) throw Object.assign(new Error('Nao foi possivel extrair texto suficiente do curriculo.'), { status: 422 });
  return { text, profile: parseResumeText(text) };
}
