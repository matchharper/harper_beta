// These are evaluation inputs, never runtime recommendation states.
export const PRIORITY_REVIEW_TEST_CASES = ["missing", "low", "high"] as const;
export type PriorityReviewTestCase =
  (typeof PRIORITY_REVIEW_TEST_CASES)[number];
export const PRIORITY_REVIEW_TEST_EMAIL = "khj605123@gmail.com";

export function canUsePriorityReviewTests(email: string | null | undefined) {
  return email?.trim().toLowerCase() === PRIORITY_REVIEW_TEST_EMAIL;
}

export function isPriorityReviewTestCase(
  value: unknown
): value is PriorityReviewTestCase {
  return PRIORITY_REVIEW_TEST_CASES.some((item) => item === value);
}

export type PriorityReviewTestRole = {
  roleId: string;
  companyName: string;
  roleTitle: string;
};

export type PriorityReviewTestResult = {
  caseId: PriorityReviewTestCase;
  response: string;
  role: PriorityReviewTestRole;
  model: string;
  elapsedMs: number;
  requestCount: number;
  recommendationCount: number;
  trace: Array<{
    name: string;
    input: Record<string, unknown>;
    result: unknown;
  }>;
  promptFingerprint: string;
};
