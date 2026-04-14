import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const { data: templates, error } = await (supabaseServer as any)
      .from("prompt_templates")
      .select("id, slug, name, updated_at, published_at, draft_content")
      .order("slug");

    if (error) throw error;

    // Get latest version number for each template
    const { data: versions } = await (supabaseServer as any)
      .from("prompt_versions")
      .select("template_id, version_number")
      .order("version_number", { ascending: false });

    const latestVersionMap = new Map<string, number>();
    for (const v of versions ?? []) {
      if (!latestVersionMap.has(v.template_id)) {
        latestVersionMap.set(v.template_id, v.version_number);
      }
    }

    const data = (templates ?? []).map((t: any) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      updated_at: t.updated_at,
      published_at: t.published_at,
      has_draft: !!t.draft_content,
      latest_version: latestVersionMap.get(t.id) ?? 0,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to list prompts");
  }
}
