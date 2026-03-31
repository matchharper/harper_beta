import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_EMAIL_DOMAIN, isInternalEmail } from "@/lib/internalAccess";
import { buildNetworkLead, NETWORK_WAITLIST_TYPE } from "@/lib/networkOps";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const SIGNED_URL_EXPIRES_IN_SECONDS = 60 * 10;

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isInternalEmail(user.email)) {
      return NextResponse.json(
        {
          error: `Forbidden: ${INTERNAL_EMAIL_DOMAIN} email required`,
        },
        { status: 403 }
      );
    }

    const leadId = Number(req.nextUrl.searchParams.get("id") ?? "");
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("harper_waitlist")
      .select("id, created_at, email, is_mobile, local_id, name, text, url")
      .eq("type", NETWORK_WAITLIST_TYPE)
      .eq("id", leadId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = buildNetworkLead(data);

    if (!lead.cvStorageBucket || !lead.cvStoragePath) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    const { data: signedData, error: signedError } = await supabaseServer.storage
      .from(lead.cvStorageBucket)
      .createSignedUrl(lead.cvStoragePath, SIGNED_URL_EXPIRES_IN_SECONDS);

    if (signedError || !signedData?.signedUrl) {
      return NextResponse.json(
        {
          error: signedError?.message ?? "Failed to create signed url",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      expiresInSeconds: SIGNED_URL_EXPIRES_IN_SECONDS,
      fileName: lead.cvFileName,
      url: signedData.signedUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load resume",
      },
      { status: 500 }
    );
  }
}
