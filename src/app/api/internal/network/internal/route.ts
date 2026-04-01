import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import type { TalentInternalType } from "@/lib/opsNetwork";
import {
  deleteTalentInternalEntry as deleteTalentInternalEntryFromServer,
  insertTalentInternalEntry as insertTalentInternalEntryFromServer,
  updateTalentInternalEntry as updateTalentInternalEntryFromServer,
} from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

type Body = {
  content?: string;
  entryId?: number;
  id?: number;
  type?: TalentInternalType;
};

const ALLOWED_TYPES = new Set<TalentInternalType>(["conversation", "memo"]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const leadId = Number(body.id ?? "");
    const type = body.type;
    const content = String(body.content ?? "").trim();

    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }
    if (!type || !ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: "Invalid internal type" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const entry = await insertTalentInternalEntryFromServer({
      content,
      createdBy: user.email ?? "unknown@matchharper.com",
      leadId,
      type,
    });

    return NextResponse.json({ entry, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to save internal candidate note"
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const entryId = Number(body.entryId ?? "");
    const content = String(body.content ?? "").trim();

    if (!Number.isInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid entry id" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const entry = await updateTalentInternalEntryFromServer({
      content,
      entryId,
    });

    return NextResponse.json({ entry, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update internal candidate note"
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const entryId = Number(body.entryId ?? "");

    if (!Number.isInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid entry id" }, { status: 400 });
    }

    const entry = await deleteTalentInternalEntryFromServer({
      entryId,
    });

    return NextResponse.json({ entry, ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to delete internal candidate note"
    );
  }
}
