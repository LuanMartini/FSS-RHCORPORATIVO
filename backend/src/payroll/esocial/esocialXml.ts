import type { EsocialEventType, EsocialParty, EsocialRuntimeConfig } from './esocialTypes.js';

// Fonte: XSD oficial eSocial S-1.3 (NT 06/2026), pacote de 01/07/2026.
// https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/2026-07-01_esquemas_xsd_v_s_01_03_00.zip
export const ESOCIAL_LAYOUT_VERSION = 'S-1.3/NT-06-2026';
export const ESOCIAL_XSD_PACKAGE_SHA256 = '32535dba33d0470cf44afce410840af450028fd32d3df9123f601c45cf9af8e';
export const EVENT_NAMESPACES: Record<EsocialEventType, string> = {
  'S-1200': 'http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00',
  'S-1210': 'http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00',
  'S-1299': 'http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00',
};

export class EsocialPayloadError extends Error {
  readonly code = 'ESOCIAL_INVALID_PAYLOAD';
  readonly permanent = true;

  constructor(message: string, readonly missingFields: string[] = []) {
    super(message);
    this.name = 'EsocialPayloadError';
  }
}

function xml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function required(payload: Record<string, unknown>, fields: string[]): void {
  const missing = fields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
  if (missing.length) {
    throw new EsocialPayloadError(`Evento eSocial incompleto: informe ${missing.join(', ')}.`, missing);
  }
}

function identifier(value: unknown, label: string, pattern: RegExp): string {
  const normalized = String(value ?? '').replace(/[.\-/\s]/g, '').toUpperCase();
  if (!pattern.test(normalized)) throw new EsocialPayloadError(`${label} invalido para o eSocial.`, [label]);
  return normalized;
}

function formatted(value: unknown, label: string, pattern: RegExp): string {
  const normalized = String(value ?? '').trim();
  if (!pattern.test(normalized)) throw new EsocialPayloadError(`${label} invalido para o eSocial.`, [label]);
  return normalized;
}

function cents(value: unknown, label: string): string {
  const normalized = String(value ?? '');
  if (!/^\d+$/.test(normalized)) throw new EsocialPayloadError(`${label} deve conter centavos inteiros nao negativos.`, [label]);
  const amount = BigInt(normalized);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}

function partyXml(tag: string, party: EsocialParty): string {
  return `<${tag}><tpInsc>${party.tpInsc}</tpInsc><nrInsc>${xml(party.nrInsc)}</nrInsc></${tag}>`;
}

function ideEvento(config: EsocialRuntimeConfig, period: string, kind: EsocialEventType): string {
  if (kind === 'S-1299') {
    return `<ideEvento><indApuracao>1</indApuracao><perApur>${xml(period)}</perApur><tpAmb>${config.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${xml(config.appVersion)}</verProc></ideEvento>`;
  }
  if (kind === 'S-1210') {
    return `<ideEvento><indRetif>1</indRetif><perApur>${xml(period)}</perApur><tpAmb>${config.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${xml(config.appVersion)}</verProc></ideEvento>`;
  }
  return `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${xml(period)}</perApur><tpAmb>${config.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${xml(config.appVersion)}</verProc></ideEvento>`;
}

function buildS1200(payload: Record<string, unknown>, config: EsocialRuntimeConfig, eventId: string): string {
  required(payload, ['competencia', 'cpf', 'ideDmDev', 'matricula', 'codCateg', 'estabelecimentoTpInsc', 'estabelecimentoNrInsc', 'codLotacao', 'ideTabRubr']);
  const rubrics = payload.rubricas;
  if (!Array.isArray(rubrics) || rubrics.length === 0) throw new EsocialPayloadError('S-1200 exige ao menos uma rubrica.', ['rubricas']);
  const cpf = identifier(payload.cpf, 'cpf', /^\d{11}$/);
  const category = identifier(payload.codCateg, 'codCateg', /^\d{3}$/);
  const establishmentType = Number(payload.estabelecimentoTpInsc);
  if (![1, 3, 4].includes(establishmentType)) throw new EsocialPayloadError('estabelecimentoTpInsc invalido.', ['estabelecimentoTpInsc']);
  const rubricXml = rubrics.map((item, index) => {
    const row = item as Record<string, unknown>;
    required(row, ['codigo', 'valorCentavos']);
    return `<itensRemun><codRubr>${xml(row.codigo)}</codRubr><ideTabRubr>${xml(payload.ideTabRubr)}</ideTabRubr><vrRubr>${cents(row.valorCentavos, `rubricas[${index}].valorCentavos`)}</vrRubr><indApurIR>${row.indApurIR === 1 ? 1 : 0}</indApurIR></itensRemun>`;
  }).join('');
  const period = formatted(payload.competencia, 'competencia', /^\d{4}-(0[1-9]|1[0-2])$/);
  return `<evtRemun Id="${xml(eventId)}">${ideEvento(config, period, 'S-1200')}${partyXml('ideEmpregador', config.employer)}<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><dmDev><ideDmDev>${xml(payload.ideDmDev)}</ideDmDev><codCateg>${category}</codCateg><infoPerApur><ideEstabLot><tpInsc>${establishmentType}</tpInsc><nrInsc>${xml(payload.estabelecimentoNrInsc)}</nrInsc><codLotacao>${xml(payload.codLotacao)}</codLotacao><remunPerApur><matricula>${xml(payload.matricula)}</matricula>${rubricXml}</remunPerApur></ideEstabLot></infoPerApur></dmDev></evtRemun>`;
}

function buildS1210(payload: Record<string, unknown>, config: EsocialRuntimeConfig, eventId: string): string {
  required(payload, ['dataPagamento', 'competencia', 'cpf', 'ideDmDev', 'valorLiquidoCentavos']);
  const paymentDate = formatted(payload.dataPagamento, 'dataPagamento', /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/);
  const paymentPeriod = paymentDate.slice(0, 7);
  const referencePeriod = formatted(payload.competencia, 'competencia', /^\d{4}-(0[1-9]|1[0-2])$/);
  const cpf = identifier(payload.cpf, 'cpf', /^\d{11}$/);
  return `<evtPgtos Id="${xml(eventId)}">${ideEvento(config, paymentPeriod, 'S-1210')}${partyXml('ideEmpregador', config.employer)}<ideBenef><cpfBenef>${cpf}</cpfBenef><infoPgto><dtPgto>${paymentDate}</dtPgto><tpPgto>1</tpPgto><perRef>${referencePeriod}</perRef><ideDmDev>${xml(payload.ideDmDev)}</ideDmDev><vrLiq>${cents(payload.valorLiquidoCentavos, 'valorLiquidoCentavos')}</vrLiq></infoPgto></ideBenef></evtPgtos>`;
}

function yesNo(value: unknown, field: string): 'S' | 'N' {
  if (value === true || value === 'S') return 'S';
  if (value === false || value === 'N') return 'N';
  throw new EsocialPayloadError(`${field} deve ser uma declaracao explicita S/N.`, [field]);
}

function buildS1299(payload: Record<string, unknown>, config: EsocialRuntimeConfig, eventId: string): string {
  required(payload, ['competencia']);
  const period = formatted(payload.competencia, 'competencia', /^\d{4}-(0[1-9]|1[0-2])$/);
  const flags = ['evtRemun', 'evtPgtos', 'evtComProd', 'evtContratAvNP', 'evtInfoComplPer'] as const;
  const info = flags.map((field) => `<${field}>${yesNo(payload[field], field)}</${field}>`).join('');
  return `<evtFechaEvPer Id="${xml(eventId)}">${ideEvento(config, period, 'S-1299')}${partyXml('ideEmpregador', config.employer)}<infoFech>${info}</infoFech></evtFechaEvPer>`;
}

export function buildEsocialEventXml(
  type: EsocialEventType,
  payload: Record<string, unknown>,
  config: EsocialRuntimeConfig,
  eventId: string,
): string {
  if (!/^ID[12][A-Z0-9]{12}\d{21}$/.test(eventId)) throw new EsocialPayloadError('eventId fora do padrao oficial.', ['eventId']);
  const body = type === 'S-1200' ? buildS1200(payload, config, eventId)
    : type === 'S-1210' ? buildS1210(payload, config, eventId)
      : buildS1299(payload, config, eventId);
  return `<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="${EVENT_NAMESPACES[type]}">${body}</eSocial>`;
}

export function buildEsocialEventId(party: EsocialParty, createdAt: string | Date, sequence: string | number): string {
  const registration = identifier(party.nrInsc, 'nrInsc', party.tpInsc === 1 ? /^[A-Z0-9]{8,14}$/ : /^\d{11}$/)
    .padEnd(14, '0').slice(0, 14);
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) throw new EsocialPayloadError('Data de criacao do evento invalida.', ['criado_em']);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const timestamp = `${value('year')}${value('month')}${value('day')}${value('hour')}${value('minute')}${value('second')}`;
  const seq = (BigInt(String(sequence)) % 100000n).toString().padStart(5, '0');
  return `ID${party.tpInsc}${registration}${timestamp}${seq}`;
}
