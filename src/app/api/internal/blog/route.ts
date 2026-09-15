import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsBlogPosts,
  saveOpsBlogPost,
  type OpsBlogSaveInput,
} from "@/lib/ops/blogServer";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(await fetchOpsBlogPosts());
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load blog posts");
  }
}

async function handleSave(req: NextRequest) {
  const user = await requireInternalApiUser(req);
  const input = (await req.json().catch(() => ({}))) as OpsBlogSaveInput;
  return NextResponse.json(
    await saveOpsBlogPost({ actorEmail: user.email, input })
  );
}

export async function POST(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to create blog post");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update blog post");
  }
}
