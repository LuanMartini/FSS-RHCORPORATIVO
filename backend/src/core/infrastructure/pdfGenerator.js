function ascii(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

function escapePdf(value) {
  return ascii(value).replace(/([\\()])/g, '\\$1');
}

export function generateEmploymentContract(collaborator) {
  const lines = [
    'CONTRATO INDIVIDUAL DE TRABALHO',
    '',
    `EMPREGADO(A): ${collaborator.nome_completo}`,
    `CPF: ${collaborator.cpf}`,
    `CARGO: ${collaborator.cargo_nome || 'A definir'}`,
    `DEPARTAMENTO: ${collaborator.departamento_nome || 'A definir'}`,
    `SALARIO: R$ ${Number(collaborator.salario || 0).toFixed(2)}`,
    `DATA DE ADMISSAO: ${collaborator.data_admissao || 'A definir'}`,
    '',
    'As partes firmam o presente contrato, sujeito as politicas internas,',
    'a legislacao trabalhista vigente e aos controles de seguranca da empresa.',
    '',
    'A assinatura eletronica por PIN pessoal registra autoria, integridade e data.',
  ];
  const content = lines.map((line, index) =>
    index === 0
      ? `BT /F1 16 Tf 72 760 Td (${escapePdf(line)}) Tj ET`
      : `BT /F1 10 Tf 72 ${730 - index * 24} Td (${escapePdf(line)}) Tj ET`
  ).join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
