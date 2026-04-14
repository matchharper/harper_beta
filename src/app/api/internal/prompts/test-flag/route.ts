import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);

    const { data, error } = await (supabaseServer as any)
      .from("prompt_test_flags")
      .select("template_slug")
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({
      flags: (data ?? []).map((r: any) => r.template_slug),
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to get test flags");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = await req.json();
    const slug = body.slug as string;
    const enabled = body.enabled as boolean;

    if (!slug || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "slug and enabled are required" },
        { status: 400 }
      );
    }

    if (enabled) {
      const { error } = await (supabaseServer as any)
        .from("prompt_test_flags")
        .upsert(
          { user_id: user.id, template_slug: slug, enabled_at: new Date().toISOString() },
          { onConflict: "user_id,template_slug" }
        );
      if (error) throw error;
    } else {
      const { error } = await (supabaseServer as any)
        .from("prompt_test_flags")
        .delete()
        .eq("user_id", user.id)
        .eq("template_slug", slug);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, slug, enabled });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to toggle test flag");
  }
}
