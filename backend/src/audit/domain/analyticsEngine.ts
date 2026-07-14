import type { EquityRecord, TurnoverAlertInput } from './types.js';

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

export function buildTurnoverAlerts(rows: TurnoverAlertInput[]) {
  return rows.flatMap((row) => {
    if (row.recentVoluntary < 2) return [];
    const changePercent = row.previousVoluntary === 0
      ? 100
      : ((row.recentVoluntary - row.previousVoluntary) / row.previousVoluntary) * 100;
    if (changePercent < 15) return [];
    return [{
      severity: changePercent >= 50 ? 'CRITICO' : 'ATENCAO',
      department: row.department,
      changePercent: round(changePercent, 1),
      averageTenureYears: row.averageTenureYears === null ? null : round(row.averageTenureYears, 1),
      message: `Aumento de ${round(changePercent, 1)}% nas demissoes voluntarias de ${row.department} nos ultimos 90 dias${row.averageTenureYears === null ? '.' : `; tempo medio de casa de ${round(row.averageTenureYears, 1)} anos.`}`,
    }];
  }).sort((a, b) => b.changePercent - a.changePercent);
}

function regression(records: EquityRecord[]) {
  const meanX = records.reduce((sum, item) => sum + item.tenureYears, 0) / records.length;
  const meanY = records.reduce((sum, item) => sum + item.salaryCents, 0) / records.length;
  const denominator = records.reduce((sum, item) => sum + ((item.tenureYears - meanX) ** 2), 0);
  const slope = denominator === 0 ? 0 : records.reduce((sum, item) =>
    sum + ((item.tenureYears - meanX) * (item.salaryCents - meanY)), 0) / denominator;
  return { intercept: meanY - slope * meanX, slope };
}

export function calculatePayEquity(records: EquityRecord[], minimumGroupSize = 3) {
  const points = records.flatMap((record) => {
    const peers = records.filter((item) => item.role === record.role && item.department === record.department);
    if (peers.length < 2) return [];
    const model = regression(peers);
    const expectedCents = model.intercept + model.slope * record.tenureYears;
    return [{ ...record, expectedCents: Math.round(expectedCents), residualCents: Math.round(record.salaryCents - expectedCents) }];
  });

  const dimensions = [
    { name: 'Genero', value: (record: EquityRecord) => record.gender },
    { name: 'Raca/cor', value: (record: EquityRecord) => record.race },
    { name: 'PCD', value: (record: EquityRecord) => record.disability === null ? null : record.disability ? 'SIM' : 'NAO' },
  ];
  const gaps = dimensions.flatMap((dimension) => {
    const groups = new Map<string, typeof points>();
    points.forEach((point) => {
      const key = dimension.value(point);
      if (!key || key === 'NAO_INFORMADO') return;
      groups.set(key, [...(groups.get(key) ?? []), point]);
    });
    return [...groups.entries()].flatMap(([group, items]) => {
      if (items.length < minimumGroupSize) return [];
      const meanSalary = items.reduce((sum, item) => sum + item.salaryCents, 0) / items.length;
      const meanResidual = items.reduce((sum, item) => sum + item.residualCents, 0) / items.length;
      return [{ dimension: dimension.name, group, sampleSize: items.length,
        averageSalaryCents: Math.round(meanSalary), adjustedGapPercent: round((meanResidual / meanSalary) * 100, 1) }];
    });
  });

  const bands = new Map<string, number>();
  records.forEach((record) => {
    const lower = Math.floor(record.salaryCents / 200000) * 2000;
    const label = `R$ ${lower.toLocaleString('pt-BR')}–${(lower + 1999).toLocaleString('pt-BR')}`;
    bands.set(label, (bands.get(label) ?? 0) + 1);
  });
  return {
    points: points.map(({ anonymousId, department, role, salaryCents, tenureYears, expectedCents }) =>
      ({ anonymousId, department, role, salaryCents, tenureYears, expectedCents })),
    gaps,
    salaryBands: [...bands.entries()].map(([band, total]) => ({ band, total })),
    privacy: { minimumGroupSize, suppressedRecords: Math.max(0, records.length - points.length) },
  };
}

export function demographicDistribution(records: EquityRecord[], minimumGroupSize = 3) {
  const aggregate = (dimension: string, selector: (record: EquityRecord) => string | null) => {
    const counts = new Map<string, number>();
    records.forEach((record) => {
      const key = selector(record);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].filter(([, total]) => total >= minimumGroupSize)
      .map(([group, total]) => ({ dimension, group, total }));
  };
  return [
    ...aggregate('Genero', (item) => item.gender),
    ...aggregate('Raca/cor', (item) => item.race),
    ...aggregate('PCD', (item) => item.disability === null ? null : item.disability ? 'SIM' : 'NAO'),
  ];
}
