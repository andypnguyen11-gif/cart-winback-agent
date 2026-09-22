import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgentStep } from "@/lib/agents/runAgentStep";
import type { ValidationCheck } from "@/lib/types";
import { scripted, toolMessage } from "./helpers/fakeMessages";

const Schema = z.object({ answer: z.number().int() }).strict();

const check = (name: string, passed: boolean, detail: string): ValidationCheck => ({ name, passed, detail });

function step(
  createMessage: ReturnType<typeof scripted>["createMessage"],
  validators: Array<(o: { answer: number }) => ValidationCheck[]>,
) {
  return runAgentStep({
    agent: "strategist",
    model: "claude-test",
    promptVersion: "test-v1",
    system: "Answer with the tool.",
    user: "What is 2 + 2?",
    tool: { name: "answer", description: "Give the answer.", schema: Schema },
    validators,
    createMessage,
  });
}

describe("runAgentStep validators", () => {
  it("runs injected validators after a successful parse and returns their checks, passed ones included", async () => {
    const { createMessage } = scripted([toolMessage("answer", { answer: 4 })]);
    const result = await step(createMessage, [(o) => [check("math", o.answer === 4, "2 + 2 is 4")]]);
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([{ name: "math", passed: true, detail: "2 + 2 is 4" }]);
    expect(result.call.promptVersion).toBe("test-v1");
    expect(result.call.rawResponses).toHaveLength(1);
  });

  it("reports validator issues as VALIDATION_FAILED and keeps the output for the reviewer", async () => {
    const { createMessage, calls } = scripted([toolMessage("answer", { answer: 5 })]);
    const result = await step(createMessage, [
      (o) => [check("math", o.answer === 4, `expected 4, got ${o.answer}`), check("int", true, "is an integer")],
      () => [check("second", false, "second validator also ran")],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("VALIDATION_FAILED");
    expect(result.issues).toEqual(["expected 4, got 5", "second validator also ran"]);
    expect(result.checks).toHaveLength(3);
    expect(result.output).toEqual({ answer: 5 });
    expect(calls).toHaveLength(1);
  });

  it("does not retry on validator failure; retries belong to schema failures only", async () => {
    const { createMessage, calls } = scripted([
      toolMessage("answer", { answer: 5 }),
      toolMessage("answer", { answer: 4 }),
    ]);
    const result = await step(createMessage, [(o) => [check("math", o.answer === 4, "wrong")]]);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("leaves output null when the failure happened before any parse succeeded", async () => {
    const { createMessage } = scripted([new Error("boom")]);
    const result = await step(createMessage, []);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("API_ERROR");
    expect(result.output).toBeNull();
    expect(result.issues).toEqual([]);
    expect(result.checks).toEqual([]);
  });
});

describe("runAgentStep request shape", () => {
  it("asks for low effort and leaves room above the tool payload so adaptive thinking cannot truncate the tool call", async () => {
    const { createMessage, calls } = scripted([toolMessage("answer", { answer: 4 })]);
    await step(createMessage, []);
    expect(calls).toHaveLength(1);
    expect(calls[0].output_config).toEqual({ effort: "low" });
    expect(calls[0].max_tokens).toBeGreaterThanOrEqual(4096);
  });
});
