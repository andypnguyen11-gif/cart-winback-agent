import { describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgentStep } from "@/lib/agents/runAgentStep";
import { scripted, toolMessage } from "./helpers/fakeMessages";

const Schema = z.object({ answer: z.number().int() }).strict();

function step(createMessage: ReturnType<typeof scripted>["createMessage"], validators: Array<(o: { answer: number }) => string[]>) {
  return runAgentStep({
    agent: "strategist",
    model: "claude-test",
    system: "Answer with the tool.",
    user: "What is 2 + 2?",
    tool: { name: "answer", description: "Give the answer.", schema: Schema },
    validators,
    createMessage,
  });
}

describe("runAgentStep validators", () => {
  it("runs injected validators after a successful parse and passes when they find nothing", async () => {
    const { createMessage } = scripted([toolMessage("answer", { answer: 4 })]);
    const result = await step(createMessage, [(o) => (o.answer === 4 ? [] : ["wrong"])]);
    expect(result.ok).toBe(true);
  });

  it("reports validator issues as VALIDATION_FAILED and keeps the output for the reviewer", async () => {
    const { createMessage, calls } = scripted([toolMessage("answer", { answer: 5 })]);
    const result = await step(createMessage, [
      (o) => (o.answer === 4 ? [] : [`expected 4, got ${o.answer}`]),
      () => ["second validator also ran"],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.kind).toBe("VALIDATION_FAILED");
    expect(result.issues).toEqual(["expected 4, got 5", "second validator also ran"]);
    expect(result.output).toEqual({ answer: 5 });
    expect(calls).toHaveLength(1);
  });

  it("does not retry on validator failure; retries belong to schema failures only", async () => {
    const { createMessage, calls } = scripted([
      toolMessage("answer", { answer: 5 }),
      toolMessage("answer", { answer: 4 }),
    ]);
    const result = await step(createMessage, [(o) => (o.answer === 4 ? [] : ["wrong"])]);
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
  });
});
