import type { NextRequest } from "next/server";
import { POST as uploadTalentDocument } from "@/app/api/talent/resume/upload/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return uploadTalentDocument(req);
}
