import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AGENT_MAX_OUTPUT_TOKENS, AGENT_SCHEMA_RETRIES } from "../config";
import type { AgentCallRecord, AgentError, AgentName, ValidationCheck } from "../types";
import { addUsage, getCreateMessage, toToolInputSchema, ZERO_USAGE, type CreateMessage } from "./client";

/**
 * The one shared piece of agent plumbing. Not a framework: a single function
 * that every LLM step goes through so the guarantees are identical.
 *
 *   call model with one forced tool
 *   → parse the tool input with the step's Zod schema
 *   → on schema failure, retry once with the exact errors as an error tool_result
 *   → run the step's injected deterministic validators
 *   → return output or an explicit error, always with token usage
 *
 * Nothing in here fixes, trims, or defaults a model answer.
 */

/** Returns every check it ran, passed or not, so the trace can show both. */
export type OutputValidator<T> = (output: T) => ValidationCheck[];

export interface AgentStepSpec<T> {
  agent: AgentName;
  model: string;
  promptVersion: string;
  system: string;
  user: string;
  tool: {
    name: string;
    description: string;
    schema: z.ZodType<T>;
  };
  validators?: OutputValidator<T>[];
  /**
   * Adaptive-thinking effort. Only set it for models that support the
   * parameter; others reject the request with a 400. When unset, the request
   * carries no output_config at all.
   */
  effort?: NonNullable<Anthropic.OutputConfig["effort"]>;
  /** Injected in tests. Defaults to the real SDK client when an API key exists. */
  createMessage?: CreateMessage;
}

export type AgentStepResult<T> =
  | { ok: true; output: T; checks: ValidationCheck[]; call: AgentCallRecord }
  | {
      ok: false;
      error: AgentError;
      /** Present only for VALIDATION_FAILED, so the reviewer can see what the model proposed. */
      output: T | null;
      /** Every validator check that ran (empty unless the output parsed). */
      checks: ValidationCheck[];
      /** Details of the failed checks. */
      issues: string[];
      call: AgentCallRecord;
    };

export async function runAgentStep<T>(spec: AgentStepSpec<T>): Promise<AgentStepResult<T>> {
  const started = Date.now();
  const call: AgentCallRecord = {
    agent: spec.agent,
    model: spec.model,
    promptVersion: spec.promptVersion,
    attempts: 0,
    usage: ZERO_USAGE,
    durationMs: 0,
    rawResponses: [],
  };
  const finish = (): AgentCallRecord => ({ ...call, durationMs: Date.now() - started });
  const fail = (
    error: AgentError,
    output: T | null = null,
    checks: ValidationCheck[] = [],
    issues: string[] = [],
  ): AgentStepResult<T> => ({
    ok: false,
    error,
    output,
    checks,
    issues,
    call: finish(),
  });

  const createMessage = spec.createMessage ?? getCreateMessage();
  if (!createMessage) {
    return fail({
      kind: "MISSING_API_KEY",
      message: `ANTHROPIC_API_KEY is not set; the ${spec.agent} was not called.`,
    });
  }

  const tool: Anthropic.Tool = {
    name: spec.tool.name,
    description: spec.tool.description,
    input_schema: toToolInputSchema(z.toJSONSchema(spec.tool.schema)),
    strict: true,
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: spec.user }];
  let lastError: AgentError = { kind: "NO_TOOL_CALL", message: "The model never called the tool." };

  for (let attempt = 0; attempt <= AGENT_SCHEMA_RETRIES; attempt++) {
    let response: Anthropic.Message;
    try {
      call.attempts += 1;
      response = await createMessage({
        model: spec.model,
        max_tokens: AGENT_MAX_OUTPUT_TOKENS,
        ...(spec.effort ? { output_config: { effort: spec.effort } } : {}),
        system: spec.system,
        messages,
        tools: [tool],
        tool_choice: { type: "tool", name: spec.tool.name },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail({ kind: "API_ERROR", message });
    }

    call.usage = addUsage(call.usage, response.usage);
    call.rawResponses.push(response.content);

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === spec.tool.name,
    );
    if (!toolUse) {
      lastError = {
        kind: "NO_TOOL_CALL",
        message: `Model stopped with "${response.stop_reason}" without calling ${spec.tool.name}.`,
      };
      messages.push(
        { role: "assistant", content: response.content },
        { role: "user", content: `You must respond by calling the ${spec.tool.name} tool with the required fields.` },
      );
      continue;
    }

    const parsed = spec.tool.schema.safeParse(toolUse.input);
    if (parsed.success) {
      const checks = (spec.validators ?? []).flatMap((validate) => validate(parsed.data));
      const issues = checks.filter((c) => !c.passed).map((c) => c.detail);
      if (issues.length > 0) {
        return fail(
          { kind: "VALIDATION_FAILED", message: `${spec.agent} output failed validation: ${issues.join("; ")}` },
          parsed.data,
          checks,
          issues,
        );
      }
      return { ok: true, output: parsed.data, checks, call: finish() };
    }

    const schemaIssues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    lastError = { kind: "MALFORMED_OUTPUT", message: `${spec.agent} output failed validation: ${schemaIssues}` };

    // Feed the exact schema errors back once. The model sees its own call and an error tool_result.
    messages.push(
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Invalid input: ${schemaIssues}. Call ${spec.tool.name} again with corrected fields.`,
          },
        ],
      },
    );
  }

  return fail(lastError);
}
