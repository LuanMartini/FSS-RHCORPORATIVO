import { execFile } from 'node:child_process';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import {
  assertIcpBrasilConfiguration,
  resolveIcpBrasilCertificate,
} from '../../security/icpBrasilSigner.js';
import { buildEsocialEventId, buildEsocialEventXml } from './esocialXml.js';
import { signEsocialXml } from './esocialXmlSigner.js';
import type {
  EsocialClientPort,
  EsocialOccurrence,
  EsocialOutboxEvent,
  EsocialQueryResult,
  EsocialRuntimeConfig,
  EsocialSubmissionResult,
} from './esocialTypes.js';

const execFileAsync = promisify(execFile);
const SEND_NS = 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0';
const QUERY_NS = 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0';
const BATCH_NS = 'http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1';
const QUERY_PAYLOAD_NS = 'http://www.esocial.gov.br/schema/lote/eventos/envio/consulta/retornoProcessamento/v1_0_0';
const SEND_ACTION = `${SEND_NS}/ServicoEnviarLoteEventos/EnviarLoteEventos`;
const QUERY_ACTION = `${QUERY_NS}/ServicoConsultarLoteEventos/ConsultarLoteEventos`;
const OFFICIAL_URLS = {
  producao: {
    send: 'https://webservices.envio.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc',
    query: 'https://webservices.consulta.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc',
  },
  restrita: {
    send: 'https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc',
    query: 'https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc',
  },
} as const;

export class EsocialConfigurationError extends Error {
  readonly status = 500;
  readonly expose = true;
  readonly code = 'ESOCIAL_TRANSMISSION_MISCONFIGURED';
  constructor(message: string) { super(`Transmissao eSocial indisponivel: ${message}`); this.name = 'EsocialConfigurationError'; }
}

export class EsocialTransportError extends Error {
  readonly code = 'ESOCIAL_TRANSPORT_ERROR';
  readonly transient = true;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EsocialTransportError';
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause, enumerable: false });
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EsocialConfigurationError(`configure ${name}.`);
  return value;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new EsocialConfigurationError(`${name} deve ser inteiro positivo.`);
  return parsed;
}

function party(prefix: 'EMPLOYER' | 'TRANSMITTER') {
  const type = Number(required(`ESOCIAL_${prefix}_TP_INSC`));
  if (type !== 1 && type !== 2) throw new EsocialConfigurationError(`ESOCIAL_${prefix}_TP_INSC deve ser 1 ou 2.`);
  const registration = required(`ESOCIAL_${prefix}_NR_INSC`).replace(/[.\-/\s]/g, '').toUpperCase();
  const valid = type === 1 ? /^[A-Z0-9]{8,14}$/.test(registration) : /^\d{11}$/.test(registration);
  if (!valid) throw new EsocialConfigurationError(`ESOCIAL_${prefix}_NR_INSC invalido.`);
  return { tpInsc: type as 1 | 2, nrInsc: registration };
}

export function isEsocialTransmissionEnabled(): boolean {
  return process.env.ESOCIAL_TRANSMISSION_ENABLED?.trim().toLowerCase() === 'true';
}

export function getEsocialRuntimeConfig(): EsocialRuntimeConfig {
  const environment = (process.env.ESOCIAL_ENVIRONMENT?.trim().toLowerCase() || 'restrita') as 'restrita' | 'producao';
  if (!['restrita', 'producao'].includes(environment)) throw new EsocialConfigurationError('ESOCIAL_ENVIRONMENT deve ser restrita ou producao.');
  const defaults = OFFICIAL_URLS[environment];
  const sendUrl = process.env.ESOCIAL_SEND_URL?.trim() || defaults.send;
  const queryUrl = process.env.ESOCIAL_QUERY_URL?.trim() || defaults.query;
  const urls: Array<[string, string]> = [['ESOCIAL_SEND_URL', sendUrl], ['ESOCIAL_QUERY_URL', queryUrl]];
  for (const [name, value] of urls) {
    try { if (new URL(value).protocol !== 'https:') throw new Error(); }
    catch { throw new EsocialConfigurationError(`${name} deve ser uma URL HTTPS valida.`); }
  }
  return {
    environment,
    tpAmb: environment === 'producao' ? 1 : 2,
    employer: party('EMPLOYER'),
    transmitter: party('TRANSMITTER'),
    appVersion: process.env.ESOCIAL_APP_VERSION?.trim() || 'FSS-RHCORP-1.0',
    sendUrl,
    queryUrl,
    xsdDirectory: required('ESOCIAL_XSD_DIR'),
    xsdValidatorBinary: process.env.ESOCIAL_XSD_VALIDATOR_BIN?.trim() || 'xmllint',
    requestTimeoutMs: positiveInteger(process.env.ESOCIAL_REQUEST_TIMEOUT_MS, 30_000, 'ESOCIAL_REQUEST_TIMEOUT_MS'),
    pollingIntervalMs: positiveInteger(process.env.ESOCIAL_POLLING_INTERVAL_MS, 15_000, 'ESOCIAL_POLLING_INTERVAL_MS'),
  };
}

const XSD_BY_EVENT = { 'S-1200': 'evtRemun.xsd', 'S-1210': 'evtPgtos.xsd', 'S-1299': 'evtFechaEvPer.xsd' } as const;

export async function assertEsocialTransmissionConfiguration(): Promise<void> {
  if (!isEsocialTransmissionEnabled()) return;
  if ((process.env.ICP_BRASIL_MODE ?? '').trim().toLowerCase() !== 'producao') {
    throw new EsocialConfigurationError('ICP_BRASIL_MODE=producao e obrigatorio quando a transmissao esta habilitada.');
  }
  const config = getEsocialRuntimeConfig();
  await assertIcpBrasilConfiguration();
  await Promise.all(Object.values(XSD_BY_EVENT).map(async (file) => {
    const metadata = await stat(join(config.xsdDirectory, file)).catch(() => null);
    if (!metadata?.isFile()) throw new EsocialConfigurationError(`XSD oficial ausente: ${file}.`);
  }));
  await execFileAsync(config.xsdValidatorBinary, ['--version'], { timeout: 10_000, windowsHide: true })
    .catch((error) => { throw new EsocialConfigurationError(`validador XSD indisponivel (${error instanceof Error ? error.message : error}).`); });
}

export interface EsocialSoapTransport {
  post(url: string, action: string, body: string): Promise<string>;
}

async function tlsOptions(): Promise<RequestOptions> {
  const certificate = resolveIcpBrasilCertificate();
  if (certificate.provider === 'a1') {
    return { pfx: await readFile(certificate.pfxPath), passphrase: certificate.password };
  }
  const chain = certificate.chainPath ? await readFile(certificate.chainPath, 'utf8') : '';
  const publicCertificate = await readFile(certificate.certificatePath, 'utf8');
  const engine = process.env.ESOCIAL_PKCS11_TLS_ENGINE?.trim();
  if (!engine) throw new EsocialConfigurationError('configure ESOCIAL_PKCS11_TLS_ENGINE para o mTLS com A3/HSM.');
  const separator = certificate.keyUri.includes('?') ? '&' : '?';
  const keyWithPin = certificate.keyUri.includes('pin-value=')
    ? certificate.keyUri
    : `${certificate.keyUri}${separator}pin-value=${encodeURIComponent(certificate.pin)}`;
  return {
    cert: `${publicCertificate}\n${chain}`,
    privateKeyEngine: engine,
    privateKeyIdentifier: keyWithPin,
  } as RequestOptions;
}

class MtlsSoapTransport implements EsocialSoapTransport {
  constructor(private readonly timeoutMs: number) {}

  async post(url: string, action: string, body: string): Promise<string> {
    const options = await tlsOptions();
    return new Promise<string>((resolve, reject) => {
      const request = httpsRequest(url, {
        ...options,
        method: 'POST',
        headers: {
          'content-type': 'text/xml; charset=utf-8',
          soapaction: `"${action}"`,
          'content-length': Buffer.byteLength(body),
        },
        rejectUnauthorized: true,
        timeout: this.timeoutMs,
      }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) response.destroy(new Error('Resposta eSocial excedeu 2 MiB.'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          const result = Buffer.concat(chunks).toString('utf8');
          if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
            reject(new EsocialTransportError(`Webservice eSocial respondeu HTTP ${response.statusCode}.`));
          } else resolve(result);
        });
      });
      request.on('timeout', () => request.destroy(new Error('Timeout na comunicacao com o eSocial.')));
      // O erro nativo pode conter o identificador PKCS#11 montado em memoria;
      // nao o encadeie para impedir que o PIN apareca em logs.
      request.on('error', () => reject(new EsocialTransportError('Falha no mTLS/SOAP com o eSocial.')));
      request.end(body);
    });
  }
}

export interface EsocialXsdValidator {
  validate(xml: string, eventType: EsocialOutboxEvent['tipo_evento']): Promise<void>;
}

class XmllintValidator implements EsocialXsdValidator {
  constructor(private readonly config: EsocialRuntimeConfig) {}
  async validate(document: string, eventType: EsocialOutboxEvent['tipo_evento']): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'rhcorp-esocial-xsd-'));
    const xmlPath = join(directory, 'evento.xml');
    try {
      await writeFile(xmlPath, document, { encoding: 'utf8', mode: 0o600 });
      await execFileAsync(this.config.xsdValidatorBinary, [
        '--noout', '--schema', join(this.config.xsdDirectory, XSD_BY_EVENT[eventType]), xmlPath,
      ], { timeout: 20_000, maxBuffer: 1024 * 1024, windowsHide: true });
    } catch (error) {
      throw Object.assign(new Error(`XML ${eventType} rejeitado pelo XSD oficial S-1.3.`), {
        code: 'ESOCIAL_XSD_VALIDATION_FAILED', permanent: true, cause: error,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

function envelope(content: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${content}</s:Body></s:Envelope>`;
}

export function buildSubmissionSoap(config: EsocialRuntimeConfig, eventId: string, signedEventXml: string): string {
  const event = signedEventXml.replace(/^<\?xml[^>]*>\s*/i, '');
  const batch = `<eSocial xmlns="${BATCH_NS}"><envioLoteEventos grupo="3"><ideEmpregador><tpInsc>${config.employer.tpInsc}</tpInsc><nrInsc>${config.employer.nrInsc}</nrInsc></ideEmpregador><ideTransmissor><tpInsc>${config.transmitter.tpInsc}</tpInsc><nrInsc>${config.transmitter.nrInsc}</nrInsc></ideTransmissor><eventos><evento Id="${eventId}">${event}</evento></eventos></envioLoteEventos></eSocial>`;
  return envelope(`<EnviarLoteEventos xmlns="${SEND_NS}"><loteEventos>${batch}</loteEventos></EnviarLoteEventos>`);
}

export function buildQuerySoap(protocol: string): string {
  const query = `<eSocial xmlns="${QUERY_PAYLOAD_NS}"><consultaLoteEventos><protocoloEnvio>${protocol}</protocoloEnvio></consultaLoteEventos></eSocial>`;
  return envelope(`<ConsultarLoteEventos xmlns="${QUERY_NS}"><consulta>${query}</consulta></ConsultarLoteEventos>`);
}

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false, parseTagValue: false, trimValues: true });

function findFirst(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record[key] !== undefined) return record[key];
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) { const found = findFirst(item, key); if (found !== undefined) return found; }
    } else {
      const found = findFirst(child, key); if (found !== undefined) return found;
    }
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function occurrences(value: unknown): EsocialOccurrence[] {
  const container = findFirst(value, 'ocorrencias');
  const raw = record(container).ocorrencia;
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return items.map((item) => {
    const row = record(item);
    return {
      code: String(row.codigo ?? ''), description: String(row.descricao ?? ''),
      ...(row.tipo === undefined ? {} : { type: String(row.tipo) }),
      ...(row.localizacao === undefined ? {} : { location: String(row.localizacao) }),
    };
  });
}

export function parseSubmissionResponse(rawResponse: string): EsocialSubmissionResult {
  const parsed = parser.parse(rawResponse) as Record<string, unknown>;
  const root = record(findFirst(parsed, 'retornoEnvioLoteEventos'));
  const status = record(root.status);
  const responseCode = String(status.cdResposta ?? '');
  const protocol = findFirst(root.dadosRecepcaoLote, 'protocoloEnvio');
  return {
    accepted: ['201', '202'].includes(responseCode) && protocol !== undefined,
    ...(protocol === undefined ? {} : { protocol: String(protocol) }),
    responseCode,
    description: String(status.descResposta ?? 'Resposta eSocial sem descricao.'),
    occurrences: occurrences(root),
    rawResponse,
  };
}

export function parseQueryResponse(rawResponse: string): EsocialQueryResult {
  const parsed = parser.parse(rawResponse) as Record<string, unknown>;
  const root = record(findFirst(parsed, 'retornoProcessamentoLoteEventos'));
  const batchStatus = record(root.status);
  const batchCode = String(batchStatus.cdResposta ?? '');
  if (batchCode === '101') {
    const estimate = Number(batchStatus.tempoEstimadoConclusao ?? 0);
    return {
      processed: false, accepted: false, responseCode: batchCode,
      description: String(batchStatus.descResposta ?? 'Lote aguardando processamento.'),
      ...(Number.isFinite(estimate) && estimate > 0 ? { estimatedSeconds: estimate } : {}),
      occurrences: occurrences(root), rawResponse,
    };
  }
  const eventReturn = findFirst(root.retornoEventos, 'retornoEvento');
  const processing = record(findFirst(eventReturn, 'processamento'));
  const eventCode = String(processing.cdResposta ?? batchCode);
  const receipt = findFirst(eventReturn, 'nrRecibo');
  return {
    processed: true,
    accepted: ['201', '202'].includes(batchCode) && ['201', '202'].includes(eventCode) && receipt !== undefined,
    responseCode: eventCode,
    description: String(processing.descResposta ?? batchStatus.descResposta ?? 'Resposta eSocial sem descricao.'),
    ...(receipt === undefined ? {} : { receipt: String(receipt) }),
    occurrences: occurrences(eventReturn ?? root), rawResponse,
  };
}

export interface EsocialClientDependencies {
  config?: EsocialRuntimeConfig;
  transport?: EsocialSoapTransport;
  validator?: EsocialXsdValidator;
  signer?: (xml: string) => Promise<string>;
}

export class EsocialClient implements EsocialClientPort {
  private readonly config: EsocialRuntimeConfig;
  private readonly transport: EsocialSoapTransport;
  private readonly validator: EsocialXsdValidator;
  private readonly signer: (xml: string) => Promise<string>;

  constructor(dependencies: EsocialClientDependencies = {}) {
    this.config = dependencies.config ?? getEsocialRuntimeConfig();
    this.transport = dependencies.transport ?? new MtlsSoapTransport(this.config.requestTimeoutMs);
    this.validator = dependencies.validator ?? new XmllintValidator(this.config);
    this.signer = dependencies.signer ?? signEsocialXml;
  }

  async submit(event: EsocialOutboxEvent): Promise<EsocialSubmissionResult> {
    const eventId = event.event_id ?? buildEsocialEventId(this.config.employer, event.criado_em, event.id);
    const unsigned = buildEsocialEventXml(event.tipo_evento, event.payload, this.config, eventId);
    const signed = await this.signer(unsigned);
    await this.validator.validate(signed, event.tipo_evento);
    const response = await this.transport.post(this.config.sendUrl, SEND_ACTION, buildSubmissionSoap(this.config, eventId, signed));
    return parseSubmissionResponse(response);
  }

  async query(protocol: string, _eventId: string): Promise<EsocialQueryResult> {
    const response = await this.transport.post(this.config.queryUrl, QUERY_ACTION, buildQuerySoap(protocol));
    return parseQueryResponse(response);
  }
}
