import Anthropic from "@anthropic-ai/sdk";
import { CacheManager } from "./guardrails/CacheManager";
import { BudgetManager } from "./guardrails/BudgetManager";
import { BaseAgentOptions, assertAIEnabled, callClaude, requireText } from "./common";
import { resolveModel } from "./models";
import { findUngroundedReferences } from "./grounding";

export type ExplainerOptions = BaseAgentOptions;

export interface GroundingResult {
  /** True when the local check found no cited identifiers missing from the events/evidence. */
  isGrounded: boolean;
  validatedNarrative: string;
  /** True when the validation pass rewrote the draft narrative. */
  hallucinationsRemoved: boolean;
  /** Hostnames, fault/event types or event ids cited in the narrative but absent from the events/evidence. */
  ungroundedReferences: string[];
}

const EXPLAINER_MAX_TOKENS = 4096;

export class SibylExplainer {
  private anthropic: Anthropic;
  private model: string;
  private orgId: string;
  private cache: CacheManager;
  private budget: BudgetManager;

  constructor(options: ExplainerOptions) {
    assertAIEnabled();
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = resolveModel(options.model);
    this.orgId = options.orgId || "default-org";
    this.cache = new CacheManager(options.cacheDir);
    this.budget = new BudgetManager(options.budgetFile);
  }

  /**
   * Generates a grounded root cause explanation for a failed simulation run.
   */
  public async explainFailure(
    runId: string,
    capturedEvents: any[],
    promiseEvidence: any
  ): Promise<string> {
    const result = await this.explainFailureDetailed(runId, capturedEvents, promiseEvidence);
    return result.validatedNarrative;
  }

  /**
   * Same as explainFailure, but also returns the grounding assessment.
   */
  public async explainFailureDetailed(
    runId: string,
    capturedEvents: any[],
    promiseEvidence: any
  ): Promise<GroundingResult> {
    const cacheKey = this.cache.generateKey(
      { agent: 'explainer.explainFailure', model: this.model, orgId: this.orgId },
      capturedEvents,
      promiseEvidence
    );
    const cached = parseCachedGrounding(this.cache.get(cacheKey));
    if (cached) {
      return cached;
    }

    // Phase 1: Draft the narrative
    const draftNarrative = await this.draftNarrative(capturedEvents, promiseEvidence);

    // Phase 2: Grounding validation
    const groundingResult = await this.validateGrounding(draftNarrative, capturedEvents, promiseEvidence);

    this.cache.set(cacheKey, JSON.stringify(groundingResult));
    return groundingResult;
  }

  private async draftNarrative(events: any[], evidence: any): Promise<string> {
    const prompt = `You are a site reliability engineer diagnosing a failed chaos engineering simulation.
Based on the following telemetry and failing promise evidence, write a human-readable "before/after" narrative (Alert -> What was checked -> Where it broke -> Why).
Do not invent any details. Only state facts present in the provided JSON.

Captured Events:
${JSON.stringify(events, null, 2)}

Failing Promise Evidence:
${JSON.stringify(evidence, null, 2)}
`;

    const response = await callClaude(
      { anthropic: this.anthropic, budget: this.budget, orgId: this.orgId, model: this.model },
      { max_tokens: EXPLAINER_MAX_TOKENS, messages: [{ role: "user", content: prompt }] }
    );
    return requireText(response);
  }

  private async validateGrounding(narrative: string, events: any[], evidence: any): Promise<GroundingResult> {
    const validationPrompt = `You are a strict grounding validator.
Review the following explanation narrative against the provided raw telemetry events.
If any claim in the narrative CANNOT be traced to a specific event in the telemetry, you must rewrite the narrative to remove the hallucinated claim.
Otherwise, output the narrative exactly as is.

Narrative:
${narrative}

Raw Telemetry:
${JSON.stringify(events, null, 2)}

Output ONLY the validated narrative. Do not output any conversational text.`;

    const response = await callClaude(
      { anthropic: this.anthropic, budget: this.budget, orgId: this.orgId, model: this.model },
      { max_tokens: EXPLAINER_MAX_TOKENS, messages: [{ role: "user", content: validationPrompt }] }
    );
    const validatedText = requireText(response);

    const ungroundedReferences = findUngroundedReferences(validatedText, events, evidence);

    return {
      isGrounded: ungroundedReferences.length === 0,
      validatedNarrative: validatedText,
      hallucinationsRemoved: validatedText.trim() !== narrative.trim(),
      ungroundedReferences
    };
  }

}

function parseCachedGrounding(raw: string | null): GroundingResult | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value && typeof value.validatedNarrative === 'string' &&
      typeof value.isGrounded === 'boolean' &&
      typeof value.hallucinationsRemoved === 'boolean' &&
      Array.isArray(value.ungroundedReferences)
    ) {
      return value as GroundingResult;
    }
  } catch {
    // malformed cached value: treat as a miss
  }
  return null;
}
