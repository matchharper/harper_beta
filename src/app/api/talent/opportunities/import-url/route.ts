import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { careerT } from "@/lib/career/translatedCareerMessage";
import { importCareerJobLink } from "@/lib/career/jobLinkImportServer";

export const maxDuration = 300;

const MAX_IMPORT_ITEMS = 20;
const IMPORT_CONCURRENCY = 4;

type ImportSavedStage = "applied" | "closed" | "connected" | "saved";

type ImportRequestItem = {
  clientId?: string | null;
  companyName?: string | null;
  savedStage?: string | null;
  title?: string | null;
  url?: string | null;
};

type ImportRequestBody = ImportRequestItem & {
  items?: ImportRequestItem[] | null;
  locale?: string | null;
};

function isImportSavedStage(value: unknown): value is ImportSavedStage {
  return (
    value === "saved" ||
    value === "applied" ||
    value === "connected" ||
    value === "closed"
  );
}

function itemError(args: {
  clientId: string;
  code: "invalid_job_url" | "job_details_required" | "job_import_failed";
  locale: string | null;
}) {
  if (args.code === "invalid_job_url") {
    return {
      clientId: args.clientId,
      code: args.code,
      error: careerT(
        args.locale,
        "career.api.opportunities.import_url_invalid",
        "올바른 공고 링크를 입력해 주세요."
      ),
      ok: false as const,
    };
  }
  if (args.code === "job_details_required") {
    return {
      clientId: args.clientId,
      code: args.code,
      detailsRequired: true,
      error: careerT(
        args.locale,
        "career.api.opportunities.import_url_details_required",
        "공고에서 회사명과 포지션명을 확인하지 못했습니다. 두 항목을 직접 입력해 주세요."
      ),
      ok: false as const,
    };
  }
  return {
    clientId: args.clientId,
    code: args.code,
    error: careerT(
      args.locale,
      "career.api.opportunities.import_url_failed",
      "공고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
    ),
    ok: false as const,
  };
}

export async function POST(req: NextRequest) {
  let locale: string | null = req.cookies.get("NEXT_LOCALE")?.value ?? null;
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as ImportRequestBody;
    locale = body.locale ?? locale;
    const requestedItems = body.items;
    const isBatchRequest = Array.isArray(requestedItems);
    const items: ImportRequestItem[] = isBatchRequest
      ? requestedItems
      : [body];
    if (items.length === 0 || items.length > MAX_IMPORT_ITEMS) {
      return NextResponse.json(
        {
          code: "invalid_import_batch",
          error: careerT(
            locale,
            "career.api.opportunities.import_url_batch_limit",
            "공고는 한 번에 20개까지 저장할 수 있습니다."
          ),
        },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const results: Array<Record<string, unknown>> = [];
    for (let offset = 0; offset < items.length; offset += IMPORT_CONCURRENCY) {
      const chunk = items.slice(offset, offset + IMPORT_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item, chunkIndex) => {
          const itemIndex = offset + chunkIndex;
          const clientId = String(item.clientId ?? itemIndex).slice(0, 120);
          const url = String(item.url ?? "").trim();
          if (!url || !isImportSavedStage(item.savedStage)) {
            return itemError({
              clientId,
              code: "invalid_job_url",
              locale,
            });
          }

          try {
            const result = await importCareerJobLink({
              admin,
              manual: {
                companyName: item.companyName,
                title: item.title,
              },
              savedStage: item.savedStage,
              talentId: user.id,
              url,
            });
            return {
              ...result,
              clientId,
              ok: true as const,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (message.includes("invalid_job_url")) {
              return itemError({
                clientId,
                code: "invalid_job_url",
                locale,
              });
            }
            if (message.includes("job_details_required")) {
              return itemError({
                clientId,
                code: "job_details_required",
                locale,
              });
            }

            console.error("[career-history:import-job-url]", {
              clientId,
              error: message,
            });
            return itemError({
              clientId,
              code: "job_import_failed",
              locale,
            });
          }
        })
      );
      results.push(...chunkResults);
    }

    if (!isBatchRequest) {
      const result = results[0];
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }

    return NextResponse.json({
      ok: results.every((result) => result.ok === true),
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[career-history:import-job-url]", { error: message });
    return NextResponse.json(
      {
        code: "job_import_failed",
        error: careerT(
          locale,
          "career.api.opportunities.import_url_failed",
          "공고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
        ),
      },
      { status: 500 }
    );
  }
}
