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

export interface BudgetRatios {
  planner: number;
  researcher: number;
  writer: number;
  factChecker: number;
}

export const DEFAULT_BUDGET_RATIOS: BudgetRatios = {
  planner: 0.1,
  researcher: 0.6,
  writer: 0.2,
  factChecker: 0.1,
};

export function splitBudget(
  total: { usd?: number; tokens?: number },
  ratios: BudgetRatios = DEFAULT_BUDGET_RATIOS,
): BudgetSplit {
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
    planner: carve(ratios.planner),
    researcher: carve(ratios.researcher),
    writer: carve(ratios.writer),
    factChecker: carve(ratios.factChecker),
  };
}
