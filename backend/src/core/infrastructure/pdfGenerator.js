import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE = { width: 595.28, height: 841.89, margin: 56 };
const NAVY = rgb(0.05, 0.16, 0.27);
const BLUE = rgb(0.04, 0.39, 0.64);
const MUTED = rgb(0.35, 0.4, 0.46);

function text(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim() || 'Não informado';
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function date(value) {
  if (!value) return 'A definir';
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? text(value) : new Intl.DateTimeFormat('pt-BR').format(parsed);
}

function wrap(font, value, size, width) {
  const lines = [];
  let line = '';
  for (const word of text(value).split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function drawHeader(page, regular, pageNumber) {
  page.drawRectangle({ x: 0, y: PAGE.height - 8, width: PAGE.width, height: 8, color: BLUE });
  page.drawText('FSS RH CORPORATIVO', { x: PAGE.margin, y: PAGE.height - 37, size: 8, font: regular, color: BLUE });
  page.drawText(`CONTRATO DE TRABALHO  |  Página ${pageNumber}`, {
    x: PAGE.width - PAGE.margin - 176, y: PAGE.height - 37, size: 8, font: regular, color: MUTED,
  });
}

export async function generateEmploymentContract(collaborator) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Contrato Individual de Trabalho');
  pdf.setAuthor('FSS RH Corporativo');
  pdf.setSubject('Contrato individual de trabalho');
  pdf.setKeywords(['RH', 'admissão', 'contrato de trabalho']);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clauses = [
    ['1. OBJETO', 'O presente contrato formaliza a prestação de serviços pelo(a) EMPREGADO(A) à EMPREGADORA, sob o regime da Consolidação das Leis do Trabalho - CLT e demais normas aplicáveis.'],
    ['2. FUNÇÃO E LOTAÇÃO', `O(A) EMPREGADO(A) exercerá a função de ${text(collaborator.cargo_nome)} no departamento ${text(collaborator.departamento_nome)}, podendo executar atividades compatíveis com sua condição profissional.`],
    ['3. JORNADA', 'A jornada de trabalho, os intervalos, a escala e os controles de ponto observarão a legislação aplicável, o acordo coletivo vigente e as políticas internas da EMPREGADORA.'],
    ['4. REMUNERAÇÃO', `Pelos serviços prestados, será paga remuneração mensal de ${money(collaborator.salario)}, sujeita aos descontos legais e aos benefícios eventualmente concedidos pela EMPREGADORA.`],
    ['5. CONFIDENCIALIDADE E PROTEÇÃO DE DADOS', 'O(A) EMPREGADO(A) compromete-se a preservar informações confidenciais e a tratar dados pessoais somente para as finalidades autorizadas no exercício de suas atribuições.'],
    ['6. NORMAS INTERNAS', 'O(A) EMPREGADO(A) declara ciência de que deverá cumprir as políticas, os procedimentos de segurança, o código de conduta e as normas de saúde e segurança da EMPREGADORA.'],
    ['7. VIGÊNCIA', `Este contrato inicia-se em ${date(collaborator.data_admissao)} e vigorará por prazo indeterminado, salvo disposição escrita em contrário ou hipótese legal de extinção.`],
    ['8. ASSINATURA ELETRÔNICA', 'A assinatura realizada pelo link seguro e PIN pessoal vincula as partes, registra data e hora do aceite e integra o dossiê digital de admissão.'],
  ];

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let pageNumber = 1;
  drawHeader(page, regular, pageNumber);
  let y = 742;
  const addPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    drawHeader(page, regular, pageNumber);
    y = 742;
  };
  const paragraph = (value, size = 10, color = NAVY) => {
    const lines = wrap(regular, value, size, PAGE.width - PAGE.margin * 2);
    if (y - lines.length * (size + 4) < 104) addPage();
    for (const line of lines) {
      page.drawText(line, { x: PAGE.margin, y, size, font: regular, color });
      y -= size + 4;
    }
  };

  page.drawText('CONTRATO INDIVIDUAL', { x: PAGE.margin, y, size: 22, font: bold, color: NAVY });
  y -= 27;
  page.drawText('DE TRABALHO', { x: PAGE.margin, y, size: 22, font: bold, color: BLUE });
  y -= 35;
  page.drawRectangle({ x: PAGE.margin, y: y - 77, width: PAGE.width - PAGE.margin * 2, height: 77, color: rgb(0.94, 0.97, 0.99) });
  const details = [
    `EMPREGADO(A): ${text(collaborator.nome_completo)}`,
    `CPF: ${text(collaborator.cpf)}`,
    `CARGO: ${text(collaborator.cargo_nome)}`,
    `DEPARTAMENTO: ${text(collaborator.departamento_nome)}`,
    `SALÁRIO: ${money(collaborator.salario)}`,
    `ADMISSÃO: ${date(collaborator.data_admissao)}`,
  ];
  details.forEach((detail, index) => page.drawText(detail, {
    x: PAGE.margin + 15 + (index % 2) * 245, y: y - 20 - Math.floor(index / 2) * 20,
    size: 9, font: index % 2 === 0 ? bold : regular, color: NAVY,
  }));
  y -= 105;
  paragraph('Pelo presente instrumento, as partes identificadas acima celebram este contrato individual de trabalho, mediante as cláusulas a seguir.', 10);
  y -= 10;

  for (const [heading, body] of clauses) {
    const clauseHeight = 16 + wrap(regular, body, 10, PAGE.width - PAGE.margin * 2).length * 14 + 12;
    if (y - clauseHeight < 104) addPage();
    page.drawText(heading, { x: PAGE.margin, y, size: 10, font: bold, color: BLUE });
    y -= 16;
    paragraph(body);
    y -= 12;
  }

  if (y < 176) addPage();
  page.drawText('E por estarem de acordo, as partes firmam o presente instrumento.', { x: PAGE.margin, y, size: 10, font: regular, color: NAVY });
  y -= 68;
  for (const [x, label] of [[PAGE.margin, 'EMPREGADO(A)'], [PAGE.width / 2 + 18, 'EMPREGADORA']]) {
    page.drawLine({ start: { x, y }, end: { x: x + 205, y }, thickness: 0.7, color: MUTED });
    page.drawText(label, { x, y: y - 15, size: 8, font: regular, color: MUTED });
  }

  pdf.getPages().forEach((currentPage, index) => {
    currentPage.drawLine({ start: { x: PAGE.margin, y: 42 }, end: { x: PAGE.width - PAGE.margin, y: 42 }, thickness: 0.4, color: rgb(0.8, 0.84, 0.88) });
    currentPage.drawText('Documento gerado eletronicamente pelo FSS RH Corporativo.', { x: PAGE.margin, y: 27, size: 7, font: regular, color: MUTED });
    currentPage.drawText(`${index + 1} de ${pdf.getPageCount()}`, { x: PAGE.width - PAGE.margin - 28, y: 27, size: 7, font: regular, color: MUTED });
  });

  return Buffer.from(await pdf.save());
}
