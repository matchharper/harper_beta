import { NextRequest, NextResponse } from "next/server";
// @ts-ignore: pdf parser has loose types.
import pdf from "pdf-parse-fork";
import { getRequestUser } from "@/lib/supabaseServer";

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
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    let text = "";
    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parsed = await pdf(buffer);
      text = String(parsed?.text ?? "");
    } else {
      text = await file.text();
    }

    const normalized = text.trim();
    if (!normalized) {
      return NextResponse.json(
        { error: "Failed to parse resume text" },
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
