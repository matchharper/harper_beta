import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { supabaseServer } from "@/lib/supabaseServer";
import { invalidateCache } from "@/lib/talentOnboarding/prompts/promptCache";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await requireInternalApiUser(req);
    const { slug } = params;

    // Fetch current template
    const { data: template, error: fetchErr } = await (supabaseServer as any)
      .from("prompt_templates")
      .select("*")
      .eq("slug", slug)
      .single();

    if (fetchErr) throw fetchErr;
    if (!template.draft_content) {
      return NextResponse.json(
        { error: "No draft content to publish" },
        { status: 400 }
      );
    }

    // Get next version number
    const { data: latestVersion } = await (supabaseServer as any)
      .from("prompt_versions")
      .select("version_number")
      .eq("template_id", template.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersion?.version_number ?? 0) + 1;
    const now = new Date().toISOString();

    // Create version snapshot
    const { error: versionErr } = await (supabaseServer as any)
      .from("prompt_versions")
      .insert({
        template_id: template.id,
        version_number: nextVersion,
        content: template.draft_content,
        published_at: now,
        published_by: user.id,
      });

    if (versionErr) throw versionErr;

    // Update template: copy draft to content, clear draft
    const { data: updated, error: updateErr } = await (supabaseServer as any)
      .from("prompt_templates")
      .update({
        content: template.draft_content,
        draft_content: null,
        published_at: now,
        updated_at: now,
        updated_by: user.id,
      })
      .eq("slug", slug)
      .select("*")
      .single();

    if (updateErr) throw updateErr;

    // Invalidate cache so next request picks up new content
    invalidateCache();

    return NextResponse.json({
      data: updated,
      version: nextVersion,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to publish prompt");
  }
}
