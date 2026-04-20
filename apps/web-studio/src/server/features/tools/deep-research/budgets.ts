export interface BudgetLimits {
  usd?: number;
  tokens?: number;
}

export interface BudgetSplit {
  planner: BudgetLimits;
  researcher: BudgetLimits;
  writer: BudgetLimits;
  factChecker: BudgetLimits;
}

const RATIOS = {
  planner: 0.1,
  researcher: 0.6,
  writer: 0.2,
  factChecker: 0.1,
} as const;

export function splitBudget(total: { usd?: number; tokens?: number }): BudgetSplit {
  function carve(ratio: number): BudgetLimits {
    const result: BudgetLimits = {};
    if (total.usd != null) {
      result.usd = total.usd * ratio;
    }
    if (total.tokens != null) {
      result.tokens = Math.floor(total.tokens * ratio);
    }
    return result;
  }

  return {
    planner: carve(RATIOS.planner),
    researcher: carve(RATIOS.researcher),
    writer: carve(RATIOS.writer),
    factChecker: carve(RATIOS.factChecker),
  };
}
