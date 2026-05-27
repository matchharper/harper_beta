import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsOfficialJobs,
  saveOpsOfficialJob,
  type OpsOfficialJobSaveInput,
} from "@/lib/opsOfficialJobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsOfficialJobs();
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load official jobs");
  }
}

async function handleSave(req: NextRequest) {
  await requireInternalApiUser(req);
  const body = (await req.json().catch(() => ({}))) as OpsOfficialJobSaveInput;
  const payload = await saveOpsOfficialJob(body);
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to create official job");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update official job");
  }
}
