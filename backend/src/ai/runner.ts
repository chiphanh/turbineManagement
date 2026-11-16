import { z } from "zod";
import { PROMPTS, PromptVersion } from "./prompts";
export type ToolName =
  | "searchProjects"
  | "getProject"
  | "findAvailableSlots"
  | "proposeBooking";
export type ToolExecutor = (name: ToolName, input: any) => Promise<any>;
export async function runCoordinator(
  message: string,
  version: PromptVersion,
  execute: ToolExecutor,
  context = "",
  history: Array<{ role: "user" | "assistant"; content: string }> = []
) {
  const [{ ToolLoopAgent, stepCountIs, tool }, { createGroq }] =
    await Promise.all([import("ai"), import("@ai-sdk/groq")]);
  const agent = new ToolLoopAgent({
    model: createGroq({
      apiKey: process.env.GROQ_API_KEY,
      ...(process.env.GROQ_BASE_URL
        ? { baseURL: process.env.GROQ_BASE_URL }
        : {}),
    })(process.env.GROQ_MODEL ?? "openai/gpt-oss-20b"),
    instructions:
      PROMPTS[version] +
      `\nCurrent instant: ${new Date().toISOString()}. Scheduling timezone: Europe/Berlin.\n${context}`,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 1400,
    maxRetries: 1,
    tools: {
      searchProjects: tool({
        description:
          "Search projects by customer or address; return UUIDs and names. Ask for clarification for ambiguous matches.",
        inputSchema: z.object({ search: z.string().max(120) }),
        execute: (input) => execute("searchProjects", input),
      }),
      getProject: tool({
        description:
          "Get exact project details, notes, assignment and existing bookings by UUID.",
        inputSchema: z.object({ projectId: z.uuid() }),
        execute: (input) => execute("getProject", input),
      }),
      findAvailableSlots: tool({
        description:
          "Find installation slots for a project. ISO datetime strings must have timezone offsets. Weekdays 09:00–17:00 Europe/Berlin. Maximum 31 days. Default duration 180 minutes; disclose this default.",
        inputSchema: z.object({
          projectId: z.uuid(),
          from: z.iso.datetime({ offset: true }),
          to: z.iso.datetime({ offset: true }),
          durationMinutes: z.number().int().min(30).max(480).default(180),
        }),
        execute: (input) => execute("findAvailableSlots", input),
      }),
      proposeBooking: tool({
        description:
          "Propose a slot returned by findAvailableSlots in THIS request. Does not book or assign anything. The user must click Confirm booking.",
        inputSchema: z.object({
          projectId: z.uuid(),
          teamId: z.uuid(),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        }),
        execute: (input) => execute("proposeBooking", input),
      }),
    },
  });
  const result = await agent.generate({
    messages: [...history, { role: "user", content: message }],
    abortSignal: AbortSignal.timeout(90000),
  });
  return {
    text:
      result.text ||
      "The tool results are available below. Please review them before continuing.",
    usage: result.totalUsage,
    finishReason: result.finishReason,
  };
}
