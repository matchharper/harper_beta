import { z } from "zod";
import { inspectApplicationQuestions } from "./applicationQuestions.server";
import { inspectManagedQuestions } from "./applicationQuestionsAgents.server";
import { runResolvedInspectionDebug } from "./applicationLinkResolution.server";
import type { InspectionRole } from "./applicationFormInspection";
import type {
  ApplicationQuestions,
  QuestionProvider,
} from "./applicationQuestions";

async function inspectProvider(
  url: string,
  provider: QuestionProvider,
  model: string,
  signal: AbortSignal
): Promise<ApplicationQuestions> {
  if (provider !== "current")
    return inspectManagedQuestions(url, provider, model, signal);
  const started = Date.now();
  return {
    ...(await inspectApplicationQuestions(url, signal)),
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
  let last: ApplicationQuestions | undefined;
  // Reuse the existing source lookup, Exa search, URL save and single-search policy.
  const resolved = await runResolvedInspectionDebug(
    input.source,
    signal,
    () => {},
    {
      ...deps.resolution,
      inspect: async (value, browserSignal) => {
        const url = z.string().parse(value);
        last = await inspect(
          url,
          input.provider,
          input.model,
          browserSignal ?? signal
        );
        attempts.push({ url, status: last.status, execution: last.execution });
        return {
          status: last.status,
          url: last.url,
          checkedAt: new Date().toISOString(),
          limitations: last.limitations,
          fields: last.questions.map((question) => ({
            ...question,
            maxLength: null,
          })),
        };
      },
    }
  );
  return {
    ...(last ?? {
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
