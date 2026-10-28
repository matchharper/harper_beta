import type { NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentDocument,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { exportResume, ResumeExportError } from "@/lib/resumes/export";
import { resumeFileName } from "@/lib/resumes/schema";
import { AUTHORED_DOCUMENT_ORIGIN } from "@/lib/documents/authoring";
import { exportDocument } from "@/lib/documents/export";
import { recordPdfExport } from "@/lib/documents/pdfDiagnostics";
import { formatToolError } from "@/lib/llm/toolError";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  const started = Date.now();
  let diagnostic: Omit<Parameters<typeof recordPdfExport>[0], "outcome"> | undefined;
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
    diagnostic = { admin, userId: user.id, documentId, revision: body.expected_revision };
    const read = () =>
      fetchTalentDocument({ admin, userId: user.id, documentId });
    const document = await read();
    const exporter =
      document?.origin_type === AUTHORED_DOCUMENT_ORIGIN
        ? exportDocument
        : exportResume;
    const artifact = await exporter({
      expectedRevision: body.expected_revision,
      renderVersion: body.render_version,
      read,
    });
    await recordPdfExport({ ...diagnostic, outcome: "succeeded", pageCount: artifact.pageCount });
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
        "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${name}`,
      },
    });
  } catch (error) {
    if (diagnostic) await recordPdfExport({ ...diagnostic, outcome: "failed", error });
    const status = error instanceof ResumeExportError ? error.status : 500;
    if (status === 500 && process.env.NODE_ENV === "development") {
      console.error("[ResumeDocument] PDF rendering error", error);
    }
    console.info("[ResumeDocument]", {
      event: "download",
      outcome: "failure",
      status,
      error: formatToolError(error),
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
