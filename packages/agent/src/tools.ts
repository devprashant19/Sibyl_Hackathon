import { z } from "zod";
import { Tool } from "@anthropic-ai/sdk/resources/messages";

export const getPromisesTool: Tool = {
  name: "get_promises",
  description: "Retrieves the list of existing promise definitions in the current project.",
  input_schema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "The ID of the project." }
    },
    required: ["projectId"]
  }
};

export const getRecentEventsTool: Tool = {
  name: "get_recent_events",
  description: "Retrieves a sample of recent CapturedEvents from the project's telemetry to understand actual domains, targets, and topics in use.",
  input_schema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      limit: { type: "number", description: "Number of events to retrieve (e.g. 100)" }
    },
    required: ["projectId", "limit"]
  }
};

export const submitInvestigationTool: Tool = {
  name: "submit_investigation",
  description: "Submits the final generated FaultSchedule and chosen Promise for the bug report. If a new promise was required, supply the drafted code.",
  input_schema: {
    type: "object",
    properties: {
      reasoning: { 
        type: "string", 
        description: "A plain-English explanation to the user of why these fault targets and types were chosen based on the bug report and recent telemetry." 
      },
      faultSchedule: {
        type: "object",
        description: "The concrete FaultSchedule definition (JSON).",
        properties: {
          faults: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                target: { type: "string" },
                delayMs: { type: "number" },
                probability: { type: "number" }
              },
              required: ["type"]
            }
          }
        },
        required: ["faults"]
      },
      existingPromiseName: { 
        type: "string", 
        description: "The name of the existing promise to use, if applicable." 
      },
      draftNewPromiseCode: { 
        type: "string", 
        description: "If no existing promise fits, provide the TypeScript/Python DSL code for a new promise." 
      },
      clarifyingQuestion: {
        type: "string",
        description: "If the bug report is too vague to guess safe fault targets, ask a clarifying question here instead of submitting a schedule."
      }
    },
    required: ["reasoning"]
  }
};
