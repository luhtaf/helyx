import depthLimit from 'graphql-depth-limit';
import costAnalysisModule from 'graphql-cost-analysis';
import type { ValidationRule } from 'graphql';

// graphql-cost-analysis is CJS — under NodeNext ESM the default-export sometimes
// wraps inside { default: fn } depending on Node version. Unwrap defensively.
type CostAnalysisFactory = (opts: {
  maximumCost: number;
  defaultCost?: number;
  variables?: Record<string, unknown>;
  onComplete?: (cost: number) => void;
}) => ValidationRule;

const costAnalysis: CostAnalysisFactory =
  (costAnalysisModule as unknown as { default?: CostAnalysisFactory }).default
  ?? (costAnalysisModule as unknown as CostAnalysisFactory);

export const validationRules: ValidationRule[] = [
  depthLimit(8, { ignore: ['__schema', '__type'] }),
  costAnalysis({
    maximumCost: 1000,
    defaultCost: 1,
    variables: {},
    onComplete(_cost: number) {
      // Hook for cost-per-request observability (future task)
    },
  }),
];
