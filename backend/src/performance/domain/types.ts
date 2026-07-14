export const EVALUATOR_TYPES = ['AUTOAVALIACAO','GESTOR','PAR','LIDERADO'] as const;
export type EvaluatorType = typeof EVALUATOR_TYPES[number];
export type TalentDimension = 'DESEMPENHO' | 'POTENCIAL';

export interface EvaluationAnswer {
  evaluationId: number;
  evaluatorType: EvaluatorType;
  dimension: TalentDimension;
  score: number;
  questionWeight: number;
}

export type EvaluatorWeights = Record<EvaluatorType, number>;

export interface WeightedScoreResult {
  desempenho: number;
  potencial: number;
  totalAvaliacoes: number;
  distribuicao: Partial<Record<EvaluatorType, number>>;
}

export interface OkrNode {
  id: number;
  parentId: number | null;
  currentValue: number;
  initialValue: number;
  targetValue: number;
  weight: number;
  progress: number;
}

export interface OkrChange {
  id: number;
  previousValue: number;
  currentValue: number;
  previousProgress: number;
  progress: number;
  origin: 'MANUAL' | 'CASCATA';
}
