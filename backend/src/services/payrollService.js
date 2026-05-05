export function fmt(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '0.00';
  return n.toFixed(2);
}

export function calcularINSS(sb0) {
  const sb = Number(sb0);
  let inss = 0;
  let rest = sb;
  const faixas = [
    [1412.0, 0.075],
    [2666.68, 0.09],
    [4000.03, 0.12],
    [7786.02, 0.14],
  ];
  let anterior = 0;
  for (const [teto, aliq] of faixas) {
    const faixa = Math.min(rest, teto - anterior);
    if (faixa <= 0) break;
    inss += faixa * aliq;
    rest -= faixa;
    anterior = teto;
    if (rest <= 0) break;
  }
  return Math.min(inss, 908.86);
}

export function calcularIRRF(baseCalc) {
  const b = Math.max(0, Number(baseCalc));
  if (b <= 2259.2) return 0;
  if (b <= 2826.65) return b * 0.075 - 169.44;
  if (b <= 3751.05) return b * 0.15 - 381.44;
  if (b <= 4664.68) return b * 0.225 - 662.77;
  return b * 0.275 - 896.0;
}

export function calcularFGTS(sb) {
  return Number(sb) * 0.08;
}

export function montarHolerite(f, ref = new Date()) {
  const salarioBase = Number(f.salario);
  const inss = calcularINSS(salarioBase);
  const irrf = Math.max(0, calcularIRRF(salarioBase - inss));
  const fgts = calcularFGTS(salarioBase);
  const totalBruto = salarioBase;
  const totalDesc = inss + irrf;
  const liquido = totalBruto - totalDesc;
  return {
    funcionario: {
      id: f.id,
      nome: f.nome,
      cpf: f.cpf,
      cargo: f.cargo_id ?? 0,
    },
    mesReferencia: ref.getMonth() + 1,
    anoReferencia: ref.getFullYear(),
    vencimentos: { salarioBase: fmt(salarioBase) },
    descontos: { inss: fmt(inss), irrf: fmt(irrf) },
    provisoes: { fgts: fmt(fgts) },
    totalBruto: fmt(totalBruto),
    totalDescontos: fmt(totalDesc),
    totalLiquido: fmt(liquido),
    __fgts: fgts,
  };
}

export function holeritePublico(h) {
  const { __fgts, ...rest } = h;
  return rest;
}
