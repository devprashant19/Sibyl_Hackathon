import Anthropic from "@anthropic-ai/sdk";

export interface ExplainerOptions {
  apiKey: string;
  model?: string;
}

export interface GroundingResult {
  isGrounded: boolean;
  validatedNarrative: string;
  hallucinationsRemoved: boolean;
}

export class SibylExplainer {
  private anthropic: Anthropic;
  private model: string;

  constructor(options: ExplainerOptions) {
    if (process.env.SIBYL_DISABLE_AI === 'true') {
      throw new Error("AI features are explicitly disabled in this deployment (SIBYL_DISABLE_AI=true). To use AI features in an air-gapped environment, provide a local LLM endpoint.");
    }
    this.anthropic = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || "claude-3-5-sonnet-20240620";
  }

  /**
   * Generates a grounded root cause explanation for a failed simulation run.
   */
  public async explainFailure(
    runId: string, 
    capturedEvents: any[], 
    promiseEvidence: any
  ): Promise<string> {
    
    // Phase 1: Draft the narrative
    const draftNarrative = await this.draftNarrative(capturedEvents, promiseEvidence);

    // Phase 2: Grounding validation
    const groundingResult = await this.validateGrounding(draftNarrative, capturedEvents);

    return groundingResult.validatedNarrative;
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

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    });

    // @ts-ignore
    return response.content[0].text;
  }

  private async validateGrounding(narrative: string, events: any[]): Promise<GroundingResult> {
    const validationPrompt = `You are a strict grounding validator.
Review the following explanation narrative against the provided raw telemetry events.
If any claim in the narrative CANNOT be traced to a specific event in the telemetry, you must rewrite the narrative to remove the hallucinated claim.
Otherwise, output the narrative exactly as is.

Narrative:
${narrative}

Raw Telemetry:
${JSON.stringify(events, null, 2)}

Output ONLY the validated narrative. Do not output any conversational text.`;

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1000,
      messages: [{ role: "user", content: validationPrompt }]
    });

    // @ts-ignore
    const validatedText = response.content[0].text;
    
    const hallucinationsRemoved = validatedText.trim() !== narrative.trim();

    return {
      isGrounded: true,
      validatedNarrative: validatedText,
      hallucinationsRemoved
    };
  }
}
