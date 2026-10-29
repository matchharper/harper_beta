import { z } from "zod";
import { applicationStagehandRuntime } from "@/lib/career/simulation/applicationStagehandRuntime";
import { withBrowserAbort } from "@/lib/career/simulation/browserAbort";
import {
  questionInspectionInstructions,
  questionReportSchema,
} from "@/lib/career/simulation/applicationStagehand/inspectionText.mjs";
import type { ApplicationBrowserRuntimeRef } from "@/lib/career/simulation/applicationBrowserRuntimeRef";
import type { ApplicationQuestions } from "./applicationQuestions";

type Runtime = Pick<
  typeof applicationStagehandRuntime,
  "create" | "start" | "status" | "stop"
>;

export async function inspectApplicationQuestions(
  url: string,
  parentSignal: AbortSignal,
  runtime: Runtime = applicationStagehandRuntime
): Promise<ApplicationQuestions> {
  const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(180_000)]);
  let driver: ApplicationBrowserRuntimeRef | undefined;
  try {
    driver = await runtime.create([], url, {
      readOnly: true,
      inspectionMode: "questions",
      browserProvider: "browserbase",
      signal,
    });
    await withBrowserAbort(
      () => runtime.start(driver!, questionInspectionInstructions),
      signal
    );
    while (true) {
      signal.throwIfAborted();
      const state = await withBrowserAbort(
        () => runtime.status(driver!),
        signal
      );
      if (state.report) {
        const report = questionReportSchema(z).parse(state.report);
        return { ...report, url: state.snapshot?.url || url };
      }
      if (state.status === "error" || state.status === "completed")
        throw new Error(
          state.error || "질문 목록을 받기 전에 브라우저 작업이 끝났습니다."
        );
      await withBrowserAbort(
        () => new Promise((resolve) => setTimeout(resolve, 1500)),
        signal
      );
    }
  } finally {
    if (driver) await runtime.stop(driver);
  }
}
