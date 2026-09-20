/**
 * Central model configuration for all Sibyl agents.
 *
 * Model IDs and prices come from Anthropic's published model table
 * (Claude API skill reference, cached 2026-06-24). Prices are USD per
 * 1M tokens for the first-party Claude API.
 */

/** Default model used by every agent unless overridden via options or SIBYL_AGENT_MODEL. */
export const DEFAULT_MODEL = "claude-sonnet-5";

export interface ModelPrice {
  /** USD per 1M input tokens */
  inputPerMTok: number;
  /** USD per 1M output tokens */
  outputPerMTok: number;
}

export const MODEL_PRICING: Readonly<Record<string, ModelPrice>> = Object.freeze({
  "claude-fable-5-1": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
});

/**
 * Price applied to models not in MODEL_PRICING: the most expensive known
 * input and output rates, so an unknown model can never under-count spend.
 */
export const FALLBACK_MODEL_PRICE: ModelPrice = Object.freeze({
  inputPerMTok: Math.max(...Object.values(MODEL_PRICING).map(p => p.inputPerMTok)),
  outputPerMTok: Math.max(...Object.values(MODEL_PRICING).map(p => p.outputPerMTok)),
});

/**
 * Looks up the price for a model ID. Dated snapshot IDs
 * (e.g. "claude-haiku-4-5-20251001") match their base alias; the longest
 * matching alias wins. Unknown models get FALLBACK_MODEL_PRICE.
 */
export function getModelPrice(model: string | undefined): ModelPrice {
  if (!model) return FALLBACK_MODEL_PRICE;
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  let best: string | undefined;
  for (const alias of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(`${alias}-`) && (!best || alias.length > best.length)) {
      best = alias;
    }
  }
  return best ? MODEL_PRICING[best] : FALLBACK_MODEL_PRICE;
}

/** Resolves the model: explicit option > SIBYL_AGENT_MODEL env > DEFAULT_MODEL. */
export function resolveModel(model?: string): string {
  const fromEnv = process.env.SIBYL_AGENT_MODEL?.trim();
  return model?.trim() || fromEnv || DEFAULT_MODEL;
}
