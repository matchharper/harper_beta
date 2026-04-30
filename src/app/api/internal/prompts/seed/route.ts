import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { resolvePromptPath } from "@/lib/talentOnboarding/prompts/paths";
import { supabaseServer } from "@/lib/supabaseServer";
import fs from "fs";

const SEED_DATA = [
  {
    slug: "system",
    name: "System Prompt",
    file: "system.md",
    required_sections: ["persona", "reliefNudge", "defaultGuidance", "contextTemplate"],
  },
  {
    slug: "interview-steps",
    name: "Interview Steps",
    file: "interview-steps.md",
    required_sections: [
      "Step 1:", "Step 2:", "Step 3:", "Step 4:", "Step 5:", "Step 6:",
      "stepGuideTemplate", "realtimeGuideTemplate",
    ],
  },
  {
    slug: "insight-extraction",
    name: "Insight Extraction",
    file: "insight-extraction.md",
    required_sections: [
      "responseFormat", "stepTransition", "insightExtractionRules",
      "conversationGuidance", "extractionOnly",
    ],
  },
  {
    slug: "misc",
    name: "Miscellaneous",
    file: "misc.md",
    required_sections: ["firstVisitText", "Interrupt 처리", "통화 종료 시그널"],
  },
];

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const results = [];

    for (const seed of SEED_DATA) {
      const content = fs.readFileSync(resolvePromptPath(seed.file), "utf-8");

      const { data, error } = await (supabaseServer as any)
        .from("prompt_templates")
        .upsert(
          {
            slug: seed.slug,
            name: seed.name,
            content,
            required_sections: seed.required_sections,
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "slug" }
        )
        .select("id, slug")
        .single();

      if (error) {
        results.push({ slug: seed.slug, error: error.message });
        continue;
      }

      // Create initial version (v1) if none exists
      const { data: existingVersion } = await (supabaseServer as any)
        .from("prompt_versions")
        .select("id")
        .eq("template_id", data.id)
        .limit(1)
        .maybeSingle();

      if (!existingVersion) {
        await (supabaseServer as any).from("prompt_versions").insert({
          template_id: data.id,
          version_number: 1,
          content,
          published_at: new Date().toISOString(),
        });
      }

      results.push({ slug: seed.slug, id: data.id, status: "ok" });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to seed prompts");
  }
}
