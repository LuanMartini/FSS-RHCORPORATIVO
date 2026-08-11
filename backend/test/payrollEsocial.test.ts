import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signBytes } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SignedXml } from 'xml-crypto';
import {
  assertEsocialTransmissionConfiguration,
  EsocialClient,
  type EsocialSoapTransport,
  type EsocialXsdValidator,
} from '../src/payroll/esocial/esocialClient.js';
import { processNextEsocialEvent, type EsocialWorkerRepository } from '../src/payroll/esocial/esocialOutboxProcessor.js';
import {
  EsocialClosureBlockedError,
  findEsocialClosureBlockers,
} from '../src/payroll/esocial/esocialRepository.js';
import { buildEsocialEventId, buildEsocialEventXml } from '../src/payroll/esocial/esocialXml.js';
import { icpBrasilXmlSigningProvider, signEsocialXml } from '../src/payroll/esocial/esocialXmlSigner.js';
import type {
  EsocialOutboxEvent,
  EsocialQueryResult,
  EsocialRuntimeConfig,
  EsocialSubmissionResult,
} from '../src/payroll/esocial/esocialTypes.js';

const config: EsocialRuntimeConfig = {
  environment: 'restrita', tpAmb: 2,
  employer: { tpInsc: 1, nrInsc: '12345678' },
  transmitter: { tpInsc: 1, nrInsc: '12345678000195' },
  appVersion: 'FSS-RHCORP-1.0',
  sendUrl: 'https://mock.invalid/send', queryUrl: 'https://mock.invalid/query',
  xsdDirectory: '/nao-usado', xsdValidatorBinary: 'xmllint',
  requestTimeoutMs: 1000, pollingIntervalMs: 5000,
};

const eventId = buildEsocialEventId(config.employer, '2026-07-15T15:30:45.000Z', 42);
const execFileAsync = promisify(execFile);

function availableOpenSsl(): string | undefined {
  for (const candidate of ['openssl', ...(process.platform === 'win32' ? ['C:\\Program Files\\Git\\usr\\bin\\openssl.exe'] : [])]) {
    try { execFileSync(candidate, ['version'], { stdio: 'ignore', windowsHide: true }); return candidate; }
    catch { /* tenta a proxima instalacao */ }
  }
  return undefined;
}

const testOpenSsl = availableOpenSsl();

test('monta identificador oficial e XML S-1200 S-1.3 de forma deterministica', () => {
  assert.equal(eventId, 'ID1123456780000002026071512304500042');
  const document = buildEsocialEventXml('S-1200', {
    competencia: '2026-06', cpf: '12345678901', ideDmDev: 'DM-202606-42',
    matricula: 'MAT-42', codCateg: '101', estabelecimentoTpInsc: 1,
    estabelecimentoNrInsc: '12345678000195', codLotacao: 'LOT-1', ideTabRubr: 'TAB1',
    rubricas: [
      { codigo: 'SALARIO', valorCentavos: '500000', indApurIR: 0 },
      { codigo: 'INSS', valorCentavos: '50901', indApurIR: 0 },
    ],
  }, config, eventId);
  assert.equal(document, '<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00"><evtRemun Id="ID1123456780000002026071512304500042"><ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>2026-06</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>FSS-RHCORP-1.0</verProc></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>12345678</nrInsc></ideEmpregador><ideTrabalhador><cpfTrab>12345678901</cpfTrab></ideTrabalhador><dmDev><ideDmDev>DM-202606-42</ideDmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>12345678000195</nrInsc><codLotacao>LOT-1</codLotacao><remunPerApur><matricula>MAT-42</matricula><itensRemun><codRubr>SALARIO</codRubr><ideTabRubr>TAB1</ideTabRubr><vrRubr>5000.00</vrRubr><indApurIR>0</indApurIR></itensRemun><itensRemun><codRubr>INSS</codRubr><ideTabRubr>TAB1</ideTabRubr><vrRubr>509.01</vrRubr><indApurIR>0</indApurIR></itensRemun></remunPerApur></ideEstabLot></infoPerApur></dmDev></evtRemun></eSocial>');
});

test('monta XML S-1210 e S-1299 sem inferir declaracoes fiscais', () => {
  const payment = buildEsocialEventXml('S-1210', {
    dataPagamento: '2026-07-05', competencia: '2026-06', cpf: '12345678901',
    ideDmDev: 'DM-202606-42', valorLiquidoCentavos: '421099',
  }, config, eventId);
  assert.match(payment, /<perApur>2026-07<\/perApur>/);
  assert.match(payment, /<perRef>2026-06<\/perRef>/);
  assert.match(payment, /<vrLiq>4210\.99<\/vrLiq>/);

  const closing = buildEsocialEventXml('S-1299', {
    competencia: '2026-06', evtRemun: true, evtPgtos: true,
    evtComProd: false, evtContratAvNP: false, evtInfoComplPer: false,
  }, config, eventId);
  assert.match(closing, /<infoFech><evtRemun>S<\/evtRemun><evtPgtos>S<\/evtPgtos><evtComProd>N<\/evtComProd><evtContratAvNP>N<\/evtContratAvNP><evtInfoComplPer>N<\/evtInfoComplPer><\/infoFech>/);
  assert.throws(() => buildEsocialEventXml('S-1299', {
    competencia: '2026-06', evtRemun: true, evtPgtos: true,
  }, config, eventId), /declaracao explicita/);
});

test('assinador XMLDSig usa RSA-SHA256 enveloped e inclui somente o certificado final', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const unsigned = buildEsocialEventXml('S-1210', {
    dataPagamento: '2026-07-05', competencia: '2026-06', cpf: '12345678901',
    ideDmDev: 'DM-202606-42', valorLiquidoCentavos: '421099',
  }, config, eventId);
  const signed = await signEsocialXml(unsigned, {
    async certificatePem() { return '-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----'; },
    async signRsaSha256(bytes) { return signBytes('RSA-SHA256', bytes, privateKey); },
    certificateValidation: 'skip-for-test',
  });
  assert.match(signed, /Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#rsa-sha256"/);
  assert.match(signed, /Algorithm="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#enveloped-signature"/);
  assert.match(signed, /<X509Certificate>VEVTVA==<\/X509Certificate>/);
  assert.doesNotMatch(signed, /RSA PRIVATE KEY/);
});

test('certificado A1 temporario assina XML eSocial verificavel', {
  skip: testOpenSsl ? false : 'OpenSSL nao esta instalado neste ambiente.',
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rhcorp-esocial-a1-'));
  const keyPath = join(directory, 'key.pem');
  const certificatePath = join(directory, 'certificate.pem');
  const pfxPath = join(directory, 'certificate.pfx');
  const password = 'senha-local-descartavel';
  const previousMode = process.env.ICP_BRASIL_MODE;
  const previousBinary = process.env.ICP_BRASIL_OPENSSL_BIN;
  try {
    await execFileAsync(testOpenSsl!, [
      'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certificatePath,
      '-days', '1', '-nodes', '-subj', '/C=BR/O=FSS Teste/CN=eSocial local descartavel',
    ], { windowsHide: true });
    await execFileAsync(testOpenSsl!, [
      'pkcs12', '-export', '-out', pfxPath, '-inkey', keyPath, '-in', certificatePath,
      '-passout', 'env:FSS_TEST_PFX_PASSWORD',
    ], { env: { ...process.env, FSS_TEST_PFX_PASSWORD: password }, windowsHide: true });
    process.env.ICP_BRASIL_MODE = 'producao';
    process.env.ICP_BRASIL_OPENSSL_BIN = testOpenSsl!;
    const unsigned = buildEsocialEventXml('S-1210', {
      dataPagamento: '2026-07-05', competencia: '2026-06', cpf: '12345678901',
      ideDmDev: 'DM-202606-42', valorLiquidoCentavos: '421099',
    }, config, eventId);
    const signed = await signEsocialXml(unsigned, icpBrasilXmlSigningProvider({
      provider: 'a1', pfxPath, password,
    }));
    const certificate = await readFile(certificatePath, 'utf8');
    const verifier = new SignedXml({ publicCert: certificate });
    const signatureXml = signed.match(/<Signature\b[\s\S]*<\/Signature>/)?.[0];
    assert.ok(signatureXml);
    verifier.loadSignature(signatureXml);
    assert.equal(verifier.checkSignature(signed), true);
  } finally {
    if (previousMode === undefined) delete process.env.ICP_BRASIL_MODE;
    else process.env.ICP_BRASIL_MODE = previousMode;
    if (previousBinary === undefined) delete process.env.ICP_BRASIL_OPENSSL_BIN;
    else process.env.ICP_BRASIL_OPENSSL_BIN = previousBinary;
    await rm(directory, { recursive: true, force: true });
  }
});

test('worker transmite e consulta assincronamente usando webservice mock', async () => {
  const calls: string[] = [];
  const transport: EsocialSoapTransport = {
    async post(_url, action, body) {
      calls.push(action);
      if (action.includes('EnviarLoteEventos')) {
        assert.match(body, /ID1123456780000002026071512304500042/);
        return '<Envelope><Body><EnviarLoteEventosResponse><EnviarLoteEventosResult><eSocial><retornoEnvioLoteEventos><status><cdResposta>201</cdResposta><descResposta>Lote recebido.</descResposta></status><dadosRecepcaoLote><protocoloEnvio>1.2.0000000000000000042</protocoloEnvio></dadosRecepcaoLote></retornoEnvioLoteEventos></eSocial></EnviarLoteEventosResult></EnviarLoteEventosResponse></Body></Envelope>';
      }
      assert.match(body, /1\.2\.0000000000000000042/);
      return '<Envelope><Body><ConsultarLoteEventosResponse><ConsultarLoteEventosResult><eSocial><retornoProcessamentoLoteEventos><status><cdResposta>201</cdResposta><descResposta>Lote processado.</descResposta></status><retornoEventos><evento><retornoEvento><eSocial><retornoEvento Id="ID1123456780000002026071512304500042"><processamento><cdResposta>201</cdResposta><descResposta>Sucesso.</descResposta></processamento><recibo><nrRecibo>1.2.0000000000000000042</nrRecibo></recibo></retornoEvento></eSocial></retornoEvento></evento></retornoEventos></retornoProcessamentoLoteEventos></eSocial></ConsultarLoteEventosResult></ConsultarLoteEventosResponse></Body></Envelope>';
    },
  };
  const validator: EsocialXsdValidator = { async validate() {} };
  const client = new EsocialClient({ config, transport, validator, signer: async (document) => document });
  const event: EsocialOutboxEvent = {
    id: '42', folha_id: '7', contracheque_id: '9', tipo_evento: 'S-1210',
    chave_idempotencia: 'S1210:7:9', status: 'PRONTO_ENVIO', protocolo: null,
    event_id: null, recibo: null, tentativas: 1, consultas: 0, max_tentativas: 5,
    criado_em: '2026-07-15T15:30:45.000Z',
    payload: { dataPagamento: '2026-07-05', competencia: '2026-06', cpf: '12345678901', ideDmDev: 'DM-202606-42', valorLiquidoCentavos: '421099' },
  };
  const repository: EsocialWorkerRepository = {
    async claim() { return ['PRONTO_ENVIO', 'ENVIANDO'].includes(event.status) ? event : null; },
    async assignId(_id, id) { event.event_id = id; },
    async submitted(_event, result: EsocialSubmissionResult) { event.status = 'ENVIANDO'; event.protocolo = result.protocol ?? null; },
    async queryPending(_event, _result: EsocialQueryResult) { throw new Error('nao esperado'); },
    async accepted(_event, result: EsocialQueryResult) { event.status = 'ACEITO'; event.recibo = result.receipt ?? null; },
    async rejected() { throw new Error('nao esperado'); },
    async failed(_event, error) { throw error; },
  };

  assert.equal(await processNextEsocialEvent({ client, repository, eventIdFactory: () => eventId, pollingIntervalMs: 5000 }), true);
  assert.equal(event.status, 'ENVIANDO');
  assert.equal(await processNextEsocialEvent({ client, repository, eventIdFactory: () => eventId, pollingIntervalMs: 5000 }), true);
  assert.equal(event.status, 'ACEITO');
  assert.equal(event.recibo, '1.2.0000000000000000042');
  assert.equal(calls.length, 2);
});

test('fechamento S-1299 identifica e informa cada pendencia ou rejeicao', () => {
  const blockers = findEsocialClosureBlockers([
    { id: 1, tipo_evento: 'S-1200', status: 'ACEITO', chave_idempotencia: 'ok' },
    { id: 2, tipo_evento: 'S-1210', status: 'ENVIANDO', chave_idempotencia: 'pending' },
    { id: 3, tipo_evento: 'S-1200', status: 'REJEITADO', chave_idempotencia: 'rejected', ultimo_erro: 'CPF divergente' },
  ]);
  assert.deepEqual(blockers.map((item) => item.status), ['ENVIANDO', 'REJEITADO']);
  const error = new EsocialClosureBlockedError(blockers);
  assert.equal(error.status, 409);
  assert.equal(error.code, 'ESOCIAL_CLOSURE_BLOCKED');
  assert.match(error.message, /2 evento/);
});

test('transmissao habilitada falha fechada sem modo ICP-Brasil real', async () => {
  const previousEnabled = process.env.ESOCIAL_TRANSMISSION_ENABLED;
  const previousMode = process.env.ICP_BRASIL_MODE;
  process.env.ESOCIAL_TRANSMISSION_ENABLED = 'true';
  process.env.ICP_BRASIL_MODE = 'simulado';
  try {
    await assert.rejects(assertEsocialTransmissionConfiguration(), /ICP_BRASIL_MODE=producao/);
  } finally {
    if (previousEnabled === undefined) delete process.env.ESOCIAL_TRANSMISSION_ENABLED;
    else process.env.ESOCIAL_TRANSMISSION_ENABLED = previousEnabled;
    if (previousMode === undefined) delete process.env.ICP_BRASIL_MODE;
    else process.env.ICP_BRASIL_MODE = previousMode;
  }
});
