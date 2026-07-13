import { NextRequest, NextResponse } from "next/server";
// @ts-ignore: pdf parser has loose types.
import pdfFork from "pdf-parse-fork";
import { getRequestUser } from "@/lib/supabaseServer";
import { sanitizeMultilineDbText } from "@/lib/textSanitization";

const PDF_TEXT_READ_FAILED =
  "PDF를 읽는데 실패했습니다. 다른 형식의 파일을 올려주세요.";

export const runtime = "nodejs";

async function parsePdfWithFork(buffer: Buffer) {
  const parsed = await pdfFork(buffer);
  return String(parsed?.text ?? "");
}

async function parsePdfWithFallback(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const parsed = await parser.getText();
    return String(parsed?.text ?? "");
  } finally {
    await parser.destroy();
  }
}

async function parsePdfText(buffer: Buffer) {
  try {
    const text = await parsePdfWithFork(buffer);
    if (sanitizeMultilineDbText(text, 24000)) return text;
  } catch (error) {
    console.warn("[resume/parse] pdf-parse-fork failed", error);
  }

  try {
    const text = await parsePdfWithFallback(buffer);
    if (sanitizeMultilineDbText(text, 24000)) return text;
  } catch (error) {
    console.warn("[resume/parse] pdf-parse fallback failed", error);
  }

  return "";
}

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

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    let text = "";
    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      text = await parsePdfText(buffer);
    } else {
      text = await file.text();
    }

    const normalized = sanitizeMultilineDbText(text, 24000);
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
