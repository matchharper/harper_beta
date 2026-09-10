import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { CareerOnboardingChecklistProgress } from "@/components/career/types";
import {
  normalizeCareerOnboardingProgress,
  useCareerOnboardingProgress,
} from "./useCareerOnboardingProgress";

const progress = (coveredCount: number) => ({
  additionalCoveredCount: 0,
  completed: false,
  coveredCount,
  finalConfirmationCovered: false,
  minCoveredCount: 10,
  percent: coveredCount * 10,
  requiredQuestionsCovered: false,
  totalCount: 10,
});

type ProgressApi = {
  onboardingChecklistProgress: CareerOnboardingChecklistProgress | null;
  applyProgress: (value: unknown) => void;
  hydrateProgress: (value: unknown) => void;
};

test("normalizes malformed progress counters to finite bounded values", () => {
  assert.deepEqual(
    normalizeCareerOnboardingProgress({
      coveredCount: Number.POSITIVE_INFINITY,
      minCoveredCount: -3,
      percent: Number.NaN,
      totalCount: "10",
    }),
    {
      additionalCoveredCount: 0,
      completed: false,
      coveredCount: 0,
      finalConfirmationCovered: false,
      minCoveredCount: 0,
      percent: 0,
      requiredQuestionsCovered: false,
      totalCount: 10,
    }
  );
});

test("a streamed onboarding update replaces session hydration without a page reload", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/career",
  });
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document"
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });

  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const progressRef: { current: ProgressApi | null } = { current: null };
  const Harness = () => {
    progressRef.current = useCareerOnboardingProgress({
      userId: "user-1",
    });
    return null;
  };
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const waitForPercent = async (expected: number) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (
        progressRef.current?.onboardingChecklistProgress?.percent === expected
      ) {
        return;
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
      });
    }
    assert.fail(`Timed out waiting for onboarding progress ${expected}%`);
  };

  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      );
    });

    await act(async () => {
      progressRef.current?.hydrateProgress(progress(1));
    });
    await waitForPercent(10);
    assert.equal(progressRef.current?.onboardingChecklistProgress?.percent, 10);

    await act(async () => {
      progressRef.current?.applyProgress(progress(2));
    });
    await waitForPercent(20);
    assert.equal(progressRef.current?.onboardingChecklistProgress?.percent, 20);

    await act(async () => {
      progressRef.current?.applyProgress(progress(3));
    });
    await waitForPercent(30);
    assert.equal(progressRef.current?.onboardingChecklistProgress?.percent, 30);

    // A slower session response must not overwrite the newer streamed value.
    await act(async () => {
      progressRef.current?.hydrateProgress(progress(1));
    });
    assert.equal(progressRef.current?.onboardingChecklistProgress?.percent, 30);
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    dom.window.close();
  }
});
