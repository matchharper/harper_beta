import { NextRequest, NextResponse } from "next/server";
import {
  bearerToken,
  verifyContentsEngineSheetsIdentity,
} from "@/lib/contentsEngine/sheetsAuth";
import { runContentsEngineSheetsRpc } from "@/lib/contentsEngine/sheetsRpc";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let identity;
  try {
    identity = await verifyContentsEngineSheetsIdentity(
      bearerToken(request.headers.get("authorization"))
    );
  } catch (error) {
    console.warn("[contents-engine/sheets/rpc:auth]", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 300_000) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  let body: { params?: unknown; rpc?: unknown };
  try {
    body = (await request.json()) as { params?: unknown; rpc?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const data = await runContentsEngineSheetsRpc({
      actorEmail: identity.email,
      params: body.params,
      rpc: body.rpc,
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed";
    if (
      message.startsWith("Unknown Contents Engine") ||
      message.startsWith("Unknown operation field") ||
      message.includes("parameters are required")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[contents-engine/sheets/rpc]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
