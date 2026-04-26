import type { MastraScorers } from '@mastra/core/evals';
import type { MastraModelConfig } from '@mastra/core/llm';
import {
  createAnswerRelevancyScorer,
  createContentSimilarityScorer,
  createFaithfulnessScorer,
  createHallucinationScorer,
} from '@mastra/evals/scorers/prebuilt';

/**
 * Default scorers for chat-style agents.
 * AnswerRelevancy requires an LLM judge; ContentSimilarity is deterministic.
 */
export function defaultAgentScorers(model: MastraModelConfig): MastraScorers {
  return {
    relevancy: { scorer: createAnswerRelevancyScorer({ model }) },
    similarity: { scorer: createContentSimilarityScorer({ ignoreCase: true }) },
  };
}

/**
 * Default scorers for research-style workflows.
 * Both require an LLM judge to evaluate faithfulness/hallucination
 * against gathered context.
 */
export function defaultWorkflowScorers(model: MastraModelConfig): MastraScorers {
  return {
    faithfulness: { scorer: createFaithfulnessScorer({ model }) },
    hallucination: { scorer: createHallucinationScorer({ model }) },
  };
}
