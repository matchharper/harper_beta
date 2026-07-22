import { NextRequest, NextResponse } from "next/server";
import { recordOpsCrmCampaignClick } from "@/lib/ops/crmCampaignsServer";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

export const runtime = "nodejs";

function fallbackRedirectUrl(req: NextRequest) {
  return new URL(
    "/career/history?historyTab=new",
    getPublicSiteUrlFromRequest(req)
  );
}

function safeRedirectUrl(req: NextRequest, value: string | null) {
  const target = String(value ?? "").trim();
  if (!target) return fallbackRedirectUrl(req);

  try {
    const url = new URL(target);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url;
    }
  } catch {
    return fallbackRedirectUrl(req);
  }

  return fallbackRedirectUrl(req);
}

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("u");
  const redirectUrl = safeRedirectUrl(req, targetUrl);

  try {
    await recordOpsCrmCampaignClick({
      campaignId: req.nextUrl.searchParams.get("c"),
      discoveryRunId: req.nextUrl.searchParams.get("r"),
      signature: req.nextUrl.searchParams.get("s"),
      talentId: req.nextUrl.searchParams.get("t"),
      targetUrl,
      userAgent: req.headers.get("user-agent"),
    });
  } catch (error) {
    console.error("[crm-campaign-click] failed to record click", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.redirect(redirectUrl);
}
