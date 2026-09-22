import type { ValidationCheck, ValidationResult } from "../types";

/**
 * Every validator returns the same shape so the decision trace can show the
 * checks that passed as well as the ones that failed.
 */
export type { ValidationCheck, ValidationResult } from "../types";

export function fromChecks(checks: ValidationCheck[]): ValidationResult {
  return { passed: checks.every((c) => c.passed), checks };
}

/** Details of the failed checks only. */
export function failures(result: ValidationResult): string[] {
  return result.checks.filter((c) => !c.passed).map((c) => c.detail);
}
