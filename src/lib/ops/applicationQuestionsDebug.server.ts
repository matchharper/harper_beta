import { z } from "zod";
import type { ApplicationForm } from "@/lib/career/simulation/applicationForm";
import { inspectApplicationQuestions } from "./applicationQuestions.server";
import { inspectManagedQuestions } from "./applicationQuestionsAgents.server";
import { runResolvedInspectionDebug } from "./applicationLinkResolution.server";
import type {
  InspectionRole,
  InspectionTarget,
} from "./applicationFormInspection";
import type {
  ApplicationQuestions,
  QuestionProvider,
} from "./applicationQuestions";

async function inspectProvider(
  url: string,
  provider: QuestionProvider,
  model: string,
  signal: AbortSignal,
  target?: InspectionTarget
): Promise<ApplicationQuestions> {
  if (provider !== "current")
    return inspectManagedQuestions(
      url,
      provider,
      model,
      signal,
      undefined,
      target
    );
  const started = Date.now();
  return {
    ...(await inspectApplicationQuestions(url, signal, undefined, target)),
    execution: {
      provider,
      model: "gpt-6-luna",
      reasoning: "medium",
      durationMs: Date.now() - started,
      warnings: [],
    },
  };
}

export async function runQuestionsDebug(
  input: {
    source: string | InspectionRole;
    resolveOfficialLink: boolean;
    provider: QuestionProvider;
    model: string;
  },
  signal: AbortSignal,
  deps: {
    inspect?: typeof inspectProvider;
    resolution?: Omit<
      NonNullable<Parameters<typeof runResolvedInspectionDebug>[3]>,
      "inspect"
    >;
  } = {}
): Promise<ApplicationQuestions> {
  const inspect = deps.inspect ?? inspectProvider;
  const originalUrl =
    typeof input.source === "string"
      ? input.source
      : (input.source.originalUrl ?? "");
  if (!input.resolveOfficialLink)
    return inspect(originalUrl, input.provider, input.model, signal);
  const attempts: NonNullable<
    ApplicationQuestions["linkResolution"]
  >["attempts"] = [];
  const observations = new Map<ApplicationForm, ApplicationQuestions>();
  // Reuse discovery while preserving the selected provider for each extraction.
  const resolved = await runResolvedInspectionDebug(
    input.source,
    signal,
    () => {},
    {
      ...deps.resolution,
      inspect: async (value, browserSignal, options) => {
        const url = z.string().parse(value);
        const last = await inspect(
          url,
          input.provider,
          input.model,
          browserSignal ?? signal,
          options?.target
        );
        attempts.push({ url, status: last.status, execution: last.execution });
        const form: ApplicationForm = {
          status: last.status,
          url: last.url,
          checkedAt: new Date().toISOString(),
          limitations: last.limitations,
          fields: last.questions.map((question) => ({
            ...question,
            maxLength: null,
          })),
        };
        observations.set(form, last);
        return form;
      },
    }
  );
  return {
    ...(observations.get(resolved.form) ?? {
      status: "unavailable",
      url: resolved.form.url,
      questions: [],
      limitations: resolved.form.limitations,
    }),
    limitations: resolved.form.limitations,
    linkResolution: {
      originalUrl,
      savedUrl: resolved.resolution?.savedUrl ?? null,
      searches: (resolved.resolution?.searches ?? []).map(
        ({ query, selectedUrl, reason }) => ({ query, selectedUrl, reason })
      ),
      usage: resolved.usage,
      attempts,
    },
  };
}
