import { positiveId, parseActivation, parseDocumentHeaders, parseHierarchyChange, parseNewAdmission, parsePin, parseValidationDecision } from '../domain/contracts.js';
import { AppError, assertFound } from '../domain/errors.js';
import * as admissionService from '../application/admissionService.js';
import * as organizationService from '../application/organizationService.js';
import * as signatureService from '../application/signatureService.js';
import * as repository from '../infrastructure/coreRepository.js';
import { readDecrypted } from '../infrastructure/encryptedFileStorage.js';
import * as lifecycleService from '../application/lifecycleService.js';

function mapDocument(row) {
  return {
    id: Number(row.id), tipo: row.tipo, nomeOriginal: row.nome_original,
    mimeType: row.mime_type, tamanhoBytes: Number(row.tamanho_bytes),
    checksumSha256: row.checksum_sha256, metadadosOcr: row.metadados_ocr,
    confiancaOcr: Number(row.confianca_ocr), statusValidacao: row.status_validacao,
    justificativa: row.justificativa, validadoEm: row.validado_em, criadoEm: row.created_at,
  };
}

function mapAdmission(row) {
  const documents = row.documents ?? [];
  return {
    id: Number(row.id), nomeCompleto: row.nome_completo, cpf: row.cpf, email: row.email,
    telefone: row.telefone, status: row.status, etapaAdmissao: row.etapa_admissao,
    cargoNome: row.cargo_nome, departamentoNome: row.departamento_nome,
    documentosTotal: Number(row.documentos_total ?? documents.length),
    documentosAprovados: Number(row.documentos_aprovados ?? documents.filter((item) => item.status_validacao === 'APROVADO').length),
    documentosPendentes: Number(row.documentos_pendentes ?? documents.filter((item) => item.status_validacao === 'PENDENTE').length),
    documentosRecusados: Number(row.documentos_recusados ?? documents.filter((item) => item.status_validacao === 'RECUSADO').length),
    criadoEm: row.created_at,
    ...(row.documents ? { documentos: row.documents.map(mapDocument) } : {}),
  };
}

export async function listAdmissions(req, res, next) {
  try { res.json((await admissionService.listAdmissions()).map(mapAdmission)); } catch (error) { next(error); }
}

export async function getAdmission(req, res, next) {
  try { res.json(mapAdmission(await admissionService.getAdmission(positiveId(req.params.id, 'Colaborador')))); } catch (error) { next(error); }
}

export async function createAdmission(req, res, next) {
  try {
    const created = await admissionService.createAdmission({
      ...parseNewAdmission(req.body),
      userId: positiveId(req.user?.sub, 'Usuario'),
      actorReference: String(req.user?.email ?? `usuario:${req.user?.sub}`),
    });
    res.status(201).json(mapAdmission(created));
  } catch (error) {
    if (error?.code === '23505') next(new AppError('CPF ou e-mail ja cadastrado.', 409, 'DUPLICATE_ADMISSION'));
    else next(error);
  }
}

export async function activateCollaborator(req, res, next) {
  try {
    const result = await lifecycleService.activateCollaborator({
      collaboratorId: positiveId(req.params.id, 'Colaborador'),
      actorUserId: positiveId(req.user?.sub, 'Usuario'),
      actorReference: String(req.user?.email ?? `usuario:${req.user?.sub}`),
      ...parseActivation(req.body),
    });
    res.json(result);
  } catch (error) { next(error); }
}

export async function uploadDocument(req, res, next) {
  try {
    const headers = parseDocumentHeaders(req.headers);
    const document = await admissionService.uploadDocument({
      collaboratorId: positiveId(req.params.id, 'Colaborador'), ...headers, buffer: req.body,
    });
    res.status(201).json(mapDocument(document));
  } catch (error) { next(error); }
}

export async function validateDocument(req, res, next) {
  try {
    const decision = parseValidationDecision(req.body);
    const admission = await admissionService.validateDocument({
      documentId: positiveId(req.params.id, 'Documento'),
      userId: positiveId(req.user?.sub, 'Usuario'),
      ...decision,
    });
    res.json(mapAdmission(admission));
  } catch (error) { next(error); }
}

export async function previewDocument(req, res, next) {
  try {
    const document = assertFound(
      await repository.getDocumentWithCollaborator(positiveId(req.params.id, 'Documento')),
      'Documento nao encontrado.'
    );
    const content = await readDecrypted(document.storage_key);
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(document.nome_original)}`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.send(content);
  } catch (error) { next(error); }
}

export async function listOrganization(req, res, next) {
  try {
    const rows = await organizationService.listOrganization();
    res.json(rows.map((row) => ({
      id: Number(row.id), nome: row.nome, departamentoId: Number(row.departamento_id),
      superiorId: row.cargo_superior_id == null ? null : Number(row.cargo_superior_id),
      nivel: Number(row.nivel), versao: Number(row.versao),
      departamentoNome: row.departamento_nome, departamentoCodigo: row.departamento_codigo,
      ocupantes: Number(row.ocupantes),
    })));
  } catch (error) { next(error); }
}

export async function changeHierarchy(req, res, next) {
  try {
    const input = parseHierarchyChange(req.params, req.body);
    const rows = await organizationService.changeHierarchy({ ...input, userId: positiveId(req.user?.sub, 'Usuario') });
    res.json(rows.map((row) => ({
      id: Number(row.id), nome: row.nome, departamentoId: Number(row.departamento_id),
      superiorId: row.cargo_superior_id == null ? null : Number(row.cargo_superior_id),
      nivel: Number(row.nivel), versao: Number(row.versao), departamentoNome: row.departamento_nome,
      departamentoCodigo: row.departamento_codigo, ocupantes: Number(row.ocupantes),
    })));
  } catch (error) { next(error); }
}

export async function createContract(req, res, next) {
  try {
    res.status(201).json(await signatureService.createContract(
      positiveId(req.params.id, 'Colaborador'),
      { userId: positiveId(req.user?.sub, 'Usuario'), reference: String(req.user?.email ?? `usuario:${req.user?.sub}`) }
    ));
  } catch (error) { next(error); }
}

export async function confirmSignature(req, res, next) {
  try {
    const token = String(req.params.token ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(token)) throw new AppError('Token de assinatura invalido.');
    res.json(await signatureService.confirmSignature(token, parsePin(req.body), req.ip));
  } catch (error) { next(error); }
}
