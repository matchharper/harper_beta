import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentDocument,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { exportResume, ResumeExportError } from "@/lib/resumes/export";
import { resumeFileName } from "@/lib/resumes/schema";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  const started = Date.now();
  try {
    const user = await getRequestUser(req);
    if (!user)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    const body = await req.json().catch(() => null);
    if (
      !Number.isSafeInteger(body?.expected_revision) ||
      body.expected_revision < 1 ||
      typeof body.render_version !== "string"
    )
      return Response.json(
        { error: "Revision and render version are required" },
        { status: 400, headers }
      );
    const { documentId } = await context.params;
    const admin = getTalentSupabaseAdmin();
    const artifact = await exportResume({
      expectedRevision: body.expected_revision,
      renderVersion: body.render_version,
      read: () => fetchTalentDocument({ admin, userId: user.id, documentId }),
    });
    console.info("[ResumeDocument]", {
      event: "download",
      outcome: "success",
      durationMs: Date.now() - started,
      pageCount: artifact.pageCount,
    });
    const name = encodeURIComponent(resumeFileName(artifact.fileName)).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return new Response(new Uint8Array(artifact.pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume.pdf"; filename*=UTF-8''${name}`,
      },
    });
  } catch (error) {
    const status = error instanceof ResumeExportError ? error.status : 500;
    if (status === 500 && process.env.NODE_ENV === "development") {
      console.error("[ResumeDocument] PDF rendering error", error);
    }
    console.info("[ResumeDocument]", {
      event: "download",
      outcome: "failure",
      status,
      durationMs: Date.now() - started,
    });
    return Response.json(
      {
        error:
          error instanceof ResumeExportError
            ? error.message
            : "PDF generation failed. Please retry.",
      },
      { status, headers }
    );
  }
}
