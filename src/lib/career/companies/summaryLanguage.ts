import { z } from "zod";
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { companyRpcMissing, type CompanyDatum } from "../resources/companyData";
import { databaseError, resourceDb } from "../resources/types";
import { stripSentenceSourceLinks } from "./sourceLinks";

export type CompanySummaryLanguage = "ko" | "en";
type Localize = (content: string, language: CompanySummaryLanguage, signal?: AbortSignal) => Promise<string>;

const LANGUAGE_NAME: Record<CompanySummaryLanguage, string> = { ko: "Korean", en: "English" };
const SAVE_RPC = "career_save_company_datum_language_v1";
const localizedSchema = z.record(z.string(), z.object({ revision: z.string(), content: z.string() }).partial());

/** The saved overview is written in whatever language its sources used. A reader sees
 * it in their own language: the same facts, structure and links. */
const localizeWithModel: Localize = async (content, language, signal) => {
  const { createChatCompletionWithFallback } = await import("@/lib/llm/llm");
  const { CLAUDE_HAIKU_MODEL, CLAUDE_MODEL } = await import("@/lib/llm/modelConfig");
  const name = LANGUAGE_NAME[language];
  const { response } = await createChatCompletionWithFallback({
    model: CLAUDE_HAIKU_MODEL,
    fallbackModel: CLAUDE_MODEL,
    buildRequest: () => ({
      max_tokens: 16_000,
      messages: [
        {
          role: "system",
          content: `This is Harper's saved overview of a company, shown on the company's page to a reader of ${name}. Write it in ${name} with the same facts, Markdown structure and links. Keep names as the company and its sources write them. Leave content empty when the overview is already written in ${name}.`,
        },
        { role: "user", content },
      ],
    }),
    structuredOutput: {
      name: "company_overview",
      schema: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"],
        additionalProperties: false,
      },
    },
    debugLabel: "career/company-summary-language",
    signal,
  });
  const raw = response?.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw
    : Array.isArray(raw) ? raw.map((part: { text?: string }) => part?.text ?? "").join("") : "";
  return z.object({ content: z.string() }).parse(JSON.parse(text)).content.trim() || content;
};

export const companySummaryLanguage = (locale?: string | null): CompanySummaryLanguage =>
  normalizeCareerPromptLocale(locale);

/**
 * Each saved overview's text in the reader's language, keyed by its data ID. A version
 * written for an earlier revision is not reused. A version is written once and saved for
 * the next reader; when it cannot be written, the saved overview is shown as it is.
 * A version is for screens only. Screens drop the sources beside each sentence, so the
 * version is written from the text without them: the source URLs were most of the text
 * to rewrite. The model keeps reading the original with its sources.
 */
export async function readCompanySummariesInLanguage(
  admin: TalentAdminClient,
  summaries: Pick<CompanyDatum, "dataRef" | "content">[],
  locale: string | null | undefined,
  options: { signal?: AbortSignal; localize?: Localize } = {}
) {
  const language = companySummaryLanguage(locale);
  const output = new Map(summaries.map(summary => [summary.dataRef.id, summary.content]));
  if (!summaries.length) return output;
  const db = resourceDb(admin);
  const stored = await db.from("company_datas").select("id, revision, localized")
    .in("id", [...output.keys()]);
  // Before the language column exists, the overview is shown as it was saved.
  if (stored.error?.code === "42703") return output;
  databaseError(stored.error);
  const current = new Map((stored.data ?? []).map(row => [String(row.id), {
    revision: String(row.revision),
    version: localizedSchema.safeParse(row.localized).data?.[language],
  }]));
  const { localize = localizeWithModel, signal } = options;
  await Promise.all(summaries.map(async summary => {
    const row = current.get(summary.dataRef.id);
    if (!row || row.revision !== summary.dataRef.revision) return;
    if (row.version?.revision === row.revision && row.version.content?.trim()) {
      output.set(summary.dataRef.id, row.version.content);
      return;
    }
    try {
      const content = await localize(stripSentenceSourceLinks(summary.content), language, signal);
      output.set(summary.dataRef.id, content);
      const saved = await db.rpc(SAVE_RPC, {
        p_data_ref: summary.dataRef, p_language: language, p_content: content,
      });
      if (!companyRpcMissing(saved.error, SAVE_RPC)) databaseError(saved.error);
    } catch (error) {
      signal?.throwIfAborted();
      console.warn("[career/company-summary-language] kept the saved overview", {
        dataId: summary.dataRef.id, language, error: error instanceof Error ? error.message : String(error),
      });
    }
  }));
  return output;
}
