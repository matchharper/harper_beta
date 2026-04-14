import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { supabaseServer } from "@/lib/supabaseServer";
import { validateSections } from "@/lib/talentOnboarding/prompts";
import { invalidateCache } from "@/lib/talentOnboarding/prompts/promptCache";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    await requireInternalApiUser(req);
    const { slug } = params;

    const { data: template, error } = await (supabaseServer as any)
      .from("prompt_templates")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!template) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    const { data: versions } = await (supabaseServer as any)
      .from("prompt_versions")
      .select("id, version_number, content, published_at, published_by")
      .eq("template_id", template.id)
      .order("version_number", { ascending: false });

    return NextResponse.json({ data: template, versions: versions ?? [] });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to get prompt");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await requireInternalApiUser(req);
    const { slug } = params;
    const body = await req.json();
    const draftContent = body.draft_content as string;

    if (typeof draftContent !== "string") {
      return NextResponse.json(
        { error: "draft_content is required" },
        { status: 400 }
      );
    }

    // Validate required sections
    const missing = validateSections(draftContent, slug);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Missing required sections", missing },
        { status: 400 }
      );
    }

    const { data, error } = await (supabaseServer as any)
      .from("prompt_templates")
      .update({
        draft_content: draftContent,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("slug", slug)
      .select("*")
      .single();

    if (error) throw error;

    // Invalidate cache so next request picks up draft_content
    invalidateCache();

    return NextResponse.json({ data });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save draft");
  }
}
