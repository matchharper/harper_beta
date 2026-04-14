import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await requireInternalApiUser(req);
    const { slug } = params;
    const body = await req.json();
    const versionNumber = body.version_number as number;

    if (typeof versionNumber !== "number") {
      return NextResponse.json(
        { error: "version_number is required" },
        { status: 400 }
      );
    }

    // Fetch template
    const { data: template, error: templateErr } = await (supabaseServer as any)
      .from("prompt_templates")
      .select("id")
      .eq("slug", slug)
      .single();

    if (templateErr) throw templateErr;

    // Fetch the target version
    const { data: version, error: versionErr } = await (supabaseServer as any)
      .from("prompt_versions")
      .select("content")
      .eq("template_id", template.id)
      .eq("version_number", versionNumber)
      .maybeSingle();

    if (versionErr) throw versionErr;
    if (!version) {
      return NextResponse.json(
        { error: `Version ${versionNumber} not found` },
        { status: 404 }
      );
    }

    // Set the version's content as draft_content
    const { data: updated, error: updateErr } = await (supabaseServer as any)
      .from("prompt_templates")
      .update({
        draft_content: version.content,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("slug", slug)
      .select("*")
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json({ data: updated });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to rollback prompt");
  }
}
