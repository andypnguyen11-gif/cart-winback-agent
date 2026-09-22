import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvaluationResult, RunRecord } from "./types";

/**
 * JSON-file persistence. Local, single-instance, deliberately boring.
 *
 *   data/evaluations.json  last evaluation per cartId (what the UI shows)
 *   data/runs.jsonl        one line per pipeline run, append-only (observability)
 *
 * `DATA_DIR` overrides the directory; tests point it at a temp folder.
 */

export interface StorageOptions {
  dir?: string;
}

export function dataDir(opts: StorageOptions): string {
  return opts.dir ?? process.env.DATA_DIR ?? path.join(process.cwd(), "data");
}

export async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

/** Write to a sibling temp file then rename, so a crash never leaves a half-written JSON file. */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}

// ---- evaluations -----------------------------------------------------------

export type EvaluationsByCart = Record<string, EvaluationResult>;

export async function readEvaluations(opts: StorageOptions = {}): Promise<EvaluationsByCart> {
  return readJsonFile<EvaluationsByCart>(path.join(dataDir(opts), "evaluations.json"), {});
}

export async function saveEvaluation(result: EvaluationResult, opts: StorageOptions = {}): Promise<void> {
  const file = path.join(dataDir(opts), "evaluations.json");
  const current = await readJsonFile<EvaluationsByCart>(file, {});
  current[result.cartId] = result;
  await writeJsonAtomic(file, current);
}

// ---- run log -----------------------------------------------------------------

export function toRunRecord(
  result: EvaluationResult,
  models: { strategist: string; copywriter: string },
): RunRecord {
  return {
    runId: randomUUID(),
    cartId: result.cartId,
    recommendationId: result.recommendationId,
    evaluatedAt: result.evaluatedAt,
    status: result.status,
    latencyMs: result.latencyMs,
    models,
    calls: result.calls,
    recommendation: result.recommendation,
    message: result.message,
    validation: result.validation,
    issues: result.issues,
    agentError: result.agentError,
  };
}

export async function appendRun(record: RunRecord, opts: StorageOptions = {}): Promise<void> {
  const file = path.join(dataDir(opts), "runs.jsonl");
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(record) + "\n", "utf8");
}

export async function readRuns(opts: StorageOptions = {}): Promise<RunRecord[]> {
  const file = path.join(dataDir(opts), "runs.jsonl");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RunRecord);
}
