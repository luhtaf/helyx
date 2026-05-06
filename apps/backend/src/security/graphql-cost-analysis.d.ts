declare module 'graphql-cost-analysis' {
  import { ValidationRule } from 'graphql';

  interface CostAnalysisOptions {
    maximumCost: number;
    defaultCost?: number;
    variables?: Record<string, unknown>;
    onComplete?: (cost: number) => void;
  }

  function costAnalysis(options: CostAnalysisOptions): ValidationRule;
  export default costAnalysis;
}
