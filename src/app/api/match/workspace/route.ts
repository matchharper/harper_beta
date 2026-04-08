import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  createMatchWorkspace,
  fetchMatchWorkspace,
  updateMatchWorkspace,
} from "@/lib/match/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const workspaceId = String(searchParams.get("workspaceId") ?? "").trim();
    const data = await fetchMatchWorkspace({
      userId: user.id,
      workspaceId: workspaceId || null,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load match workspace";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      companyDescription?: string | null;
      companyName?: string;
      homepageUrl?: string | null;
      linkedinUrl?: string | null;
    };

    const workspace = await createMatchWorkspace({
      companyDescription: body.companyDescription,
      companyName: String(body.companyName ?? ""),
      homepageUrl: body.homepageUrl,
      linkedinUrl: body.linkedinUrl,
      userId: user.id,
    });

    const data = await fetchMatchWorkspace({
      userId: user.id,
      workspaceId: workspace.companyWorkspaceId,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create workspace";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      companyDescription?: string | null;
      companyName?: string;
      homepageUrl?: string | null;
      linkedinUrl?: string | null;
      workspaceId?: string | null;
    };

    const workspace = await updateMatchWorkspace({
      companyDescription: body.companyDescription,
      companyName: body.companyName,
      homepageUrl: body.homepageUrl,
      linkedinUrl: body.linkedinUrl,
      userId: user.id,
      workspaceId: body.workspaceId,
    });

    const data = await fetchMatchWorkspace({
      userId: user.id,
      workspaceId: workspace.companyWorkspaceId,
    });

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update workspace";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
