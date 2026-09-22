/**
 * Every validator returns the same shape so the decision trace can show the
 * checks that passed as well as the ones that failed.
 */
export interface ValidationCheck {
  /** Stable machine name, e.g. "offer:allowed", "evidence:cartValue". */
  name: string;
  passed: boolean;
  /** One sentence a marketer can read. */
  detail: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
}

export function fromChecks(checks: ValidationCheck[]): ValidationResult {
  return { passed: checks.every((c) => c.passed), checks };
}

/** Details of the failed checks only. This is what runAgentStep's validators return. */
export function failures(result: ValidationResult): string[] {
  return result.checks.filter((c) => !c.passed).map((c) => c.detail);
}
