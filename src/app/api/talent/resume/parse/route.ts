import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { extractResumeTextContent } from "@/lib/talentOnboarding/documentUpload";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "@/lib/talentOnboarding/documentUploadLimits";

const PDF_TEXT_READ_FAILED =
  "PDF를 읽는데 실패했습니다. 다른 형식의 파일을 올려주세요.";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File size must not exceed 4 MB" },
        { status: 413 }
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    const normalized = await extractResumeTextContent({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
    });
    if (!normalized) {
      return NextResponse.json(
        {
          error: isPdf ? PDF_TEXT_READ_FAILED : "Failed to parse resume text",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: normalized });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse resume file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
