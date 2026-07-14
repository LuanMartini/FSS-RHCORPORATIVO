import { createHash } from 'node:crypto';

export function simulateOcr({ type, fileName, collaborator }) {
  const fingerprint = createHash('sha256').update(`${fileName}:${collaborator.cpf}`).digest('hex');
  const base = { nome: collaborator.nome_completo, processadoPor: 'OCR_SIMULADO_V1' };
  const byType = {
    RG: { numero: fingerprint.slice(0, 9).toUpperCase(), orgaoEmissor: 'SSP', uf: 'SP' },
    CPF: { cpf: collaborator.cpf, situacao: 'REGULAR' },
    PIS: { pis: fingerprint.slice(0, 11).replace(/[a-f]/g, '7') },
    COMPROVANTE_RESIDENCIA: { logradouro: 'Endereco identificado para revisao humana', cep: '00000-000' },
    DIPLOMA: { instituicao: 'Instituicao identificada', curso: 'Curso identificado', conclusao: '2024' },
  };
  const confidence = 86 + (parseInt(fingerprint.slice(0, 2), 16) % 1300) / 100;
  return { metadata: { ...base, ...byType[type] }, confidence: Math.min(confidence, 98.99) };
}
