import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { extractDocument, OcrProviderError, terminateLocalOcrWorker } from '../src/core/infrastructure/ocrProvider.ts';
import { generateEmploymentContract } from '../src/core/infrastructure/pdfGenerator.js';

function syntheticDocument(...documentLines: string[]): Buffer {
  const canvas = createCanvas(1600, Math.max(540, 130 + documentLines.length * 120));
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'black';
  context.font = 'bold 54px Arial';
  documentLines.forEach((line, index) => context.fillText(line, 70, 100 + index * 110));
  return canvas.toBuffer('image/png');
}

async function withLocalOcr<T>(work: () => Promise<T>): Promise<T> {
  const provider = process.env.OCR_PROVIDER;
  const threshold = process.env.OCR_MANUAL_REVIEW_THRESHOLD;
  process.env.OCR_PROVIDER = 'tesseract';
  process.env.OCR_MANUAL_REVIEW_THRESHOLD = '85';
  try { return await work(); }
  finally {
    if (provider == null) delete process.env.OCR_PROVIDER;
    else process.env.OCR_PROVIDER = provider;
    if (threshold == null) delete process.env.OCR_MANUAL_REVIEW_THRESHOLD;
    else process.env.OCR_MANUAL_REVIEW_THRESHOLD = threshold;
  }
}

after(async () => { await terminateLocalOcrWorker(); });

test('OCR local extrai campos estruturados de documentos sintéticos', async () => {
  await withLocalOcr(async () => {
    const cpf = await extractDocument(syntheticDocument('CPF: 123.456.789-09'), 'image/png', 'CPF');
    assert.equal(cpf.metadata.cpf, '12345678909');
    assert.equal(cpf.provider, 'TESSERACT_LOCAL_V1');
    assert.equal(cpf.requiresManualReview, false);

    const rg = await extractDocument(syntheticDocument('RG: 12.345.678-9', 'ORGAO EMISSOR: SSP', 'UF: SP'), 'image/png', 'RG');
    assert.equal(rg.metadata.numero, '123456789');
    assert.equal(rg.metadata.orgaoEmissor, 'SSP');

    const pis = await extractDocument(syntheticDocument('PIS: 12345678901'), 'image/png', 'PIS');
    assert.equal(pis.metadata.pis, '12345678901');

    const address = await extractDocument(syntheticDocument('ENDERECO: RUA DAS FLORES 100', 'CEP: 01001-000'), 'image/png', 'COMPROVANTE_RESIDENCIA');
    assert.equal(address.metadata.cep, '01001-000');
    assert.match(String(address.metadata.logradouro), /RUA DAS FLORES/i);

    const diploma = await extractDocument(syntheticDocument('INSTITUICAO: UNIVERSIDADE TESTE', 'CURSO: ADMINISTRACAO', 'CONCLUSAO: 2024'), 'image/png', 'DIPLOMA');
    assert.equal(diploma.metadata.instituicao, 'UNIVERSIDADE TESTE');
    assert.equal(diploma.metadata.curso, 'ADMINISTRACAO');
    assert.equal(diploma.metadata.conclusao, '2024');
  });
});

test('OCR local extrai dados de recibo sintético sem usar o nome do arquivo', async () => {
  await withLocalOcr(async () => {
    const receipt = await extractDocument(syntheticDocument(
      'RECIBO UBER', 'CNPJ: 12.345.678/0001-90', 'DATA: 14/07/2026', 'VALOR: R$ 32,40',
    ), 'image/png', 'RECIBO');
    assert.equal(receipt.metadata.cnpj, '12345678000190');
    assert.equal(receipt.metadata.date, '2026-07-14');
    assert.equal(receipt.metadata.amountCents, 3240);
    assert.equal(receipt.metadata.category, 'MOBILIDADE');
    assert.equal(receipt.metadata.merchant, 'UBER');
    assert.ok(receipt.confidence >= 85);
  });
});

test('OCR local renderiza PDF antes de reconhecer seu conteúdo', async () => {
  await withLocalOcr(async () => {
    const pdf = generateEmploymentContract({
      nome_completo: 'Ana Teste', cpf: '12345678909', cargo_nome: 'Analista',
      departamento_nome: 'RH', salario: 4500, data_admissao: '2026-07-14',
    });
    const document = await extractDocument(pdf, 'application/pdf', 'CPF');
    assert.equal(document.metadata.cpf, '12345678909');
    assert.equal(document.provider, 'TESSERACT_LOCAL_V1');
  });
});

test('imagem sem documento não recebe dados inventados e exige revisão humana', async () => {
  await withLocalOcr(async () => {
    const empty = await extractDocument(syntheticDocument(), 'image/png', 'RECIBO');
    assert.equal(empty.metadata.amountCents, null);
    assert.equal(empty.metadata.date, null);
    assert.equal(empty.requiresManualReview, true);
  });
});

test('provedor OCR não configurado para a implantação falha fechado', async () => {
  const previous = process.env.OCR_PROVIDER;
  process.env.OCR_PROVIDER = 'aws';
  try {
    await assert.rejects(
      () => extractDocument(syntheticDocument('CPF: 123.456.789-09'), 'image/png', 'CPF'),
      (error: unknown) => error instanceof OcrProviderError && error.code === 'OCR_PROVIDER_UNAVAILABLE',
    );
  } finally {
    if (previous == null) delete process.env.OCR_PROVIDER;
    else process.env.OCR_PROVIDER = previous;
  }
});

test('produção sem OCR_PROVIDER falha fechado', async () => {
  const provider = process.env.OCR_PROVIDER;
  const nodeEnv = process.env.NODE_ENV;
  delete process.env.OCR_PROVIDER;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(
      () => extractDocument(syntheticDocument('CPF: 123.456.789-09'), 'image/png', 'CPF'),
      (error: unknown) => error instanceof OcrProviderError && error.code === 'OCR_PROVIDER_UNAVAILABLE',
    );
  } finally {
    if (provider == null) delete process.env.OCR_PROVIDER;
    else process.env.OCR_PROVIDER = provider;
    if (nodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
  }
});
