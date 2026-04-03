import { NextRequest, NextResponse } from "next/server";
import {
  requireAtsApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  addAtsContactHistory,
  clearAtsEmailDiscoveryTrace,
  deleteAtsContactHistory,
  fetchAtsCandidateDetail,
  generateAtsContactEmailDraft,
  saveAtsCandidateMemo,
  saveAtsSequenceSchedule,
  sendAtsSingleManualEmail,
} from "@/lib/ats/server";
import { normalizeAtsSequenceSchedule } from "@/lib/ats/shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAtsApiUser(req);
    const { searchParams } = new URL(req.url);
    const candidId = String(searchParams.get("candidId") ?? "").trim();

    if (!candidId) {
      return NextResponse.json(
        { error: "candidId is required" },
        { status: 400 }
      );
    }

    const data = await fetchAtsCandidateDetail({
      candidId,
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load ATS candidate");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAtsApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      action?:
        | "memo"
        | "schedule"
        | "add_history"
        | "delete_history"
        | "clear_email_trace"
        | "generate_contact_email"
        | "send_contact_email";
      body?: string | null;
      candidId?: string;
      channel?: "email" | "linkedin" | "call" | "meeting" | "other";
      contactedAt?: string;
      historyId?: string;
      memo?: string | null;
      note?: string | null;
      subject?: string | null;
      targetEmail?: string | null;
      sequenceSchedule?: unknown;
    };
    const candidId = String(body.candidId ?? "").trim();

    if (!candidId) {
      return NextResponse.json(
        { error: "candidId is required" },
        { status: 400 }
      );
    }

    if (body.action === "memo") {
      const outreach = await saveAtsCandidateMemo({
        candidId,
        memo: String(body.memo ?? "").trim() || null,
        userId: user.id,
      });
      return NextResponse.json({ ok: true, outreach });
    }

    if (body.action === "schedule") {
      const outreach = await saveAtsSequenceSchedule({
        candidId,
        sequenceSchedule: normalizeAtsSequenceSchedule(body.sequenceSchedule),
        userId: user.id,
      });
      return NextResponse.json({ ok: true, outreach });
    }

    if (body.action === "add_history") {
      const channel =
        body.channel === "linkedin" ||
        body.channel === "call" ||
        body.channel === "meeting" ||
        body.channel === "other"
          ? body.channel
          : "email";
      const contactedAt = String(body.contactedAt ?? "").trim();
      if (!contactedAt) {
        return NextResponse.json(
          { error: "contactedAt is required" },
          { status: 400 }
        );
      }

      const outreach = await addAtsContactHistory({
        candidId,
        channel,
        contactedAt,
        note: String(body.note ?? "").trim() || null,
        userId: user.id,
      });
      return NextResponse.json({ ok: true, outreach });
    }

    if (body.action === "delete_history") {
      const historyId = String(body.historyId ?? "").trim();
      if (!historyId) {
        return NextResponse.json(
          { error: "historyId is required" },
          { status: 400 }
        );
      }

      const outreach = await deleteAtsContactHistory({
        candidId,
        historyId,
        userId: user.id,
      });
      return NextResponse.json({ ok: true, outreach });
    }

    if (body.action === "clear_email_trace") {
      const outreach = await clearAtsEmailDiscoveryTrace({
        candidId,
        userId: user.id,
      });
      return NextResponse.json({ ok: true, outreach });
    }

    if (body.action === "generate_contact_email") {
      const draft = await generateAtsContactEmailDraft({
        candidId,
        userEmail: user.email,
        userId: user.id,
      });
      return NextResponse.json({ ok: true, draft });
    }

    if (body.action === "send_contact_email") {
      const data = await sendAtsSingleManualEmail({
        body: String(body.body ?? ""),
        candidId,
        subject: String(body.subject ?? ""),
        targetEmail: String(body.targetEmail ?? "").trim() || null,
        userEmail: user.email,
        userId: user.id,
      });
      return NextResponse.json({ ok: true, data });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update ATS candidate");
  }
}
