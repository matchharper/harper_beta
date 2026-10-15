import { NextResponse } from "next/server";
import { dispatchEmailRuntimeJobs } from "@/lib/email/runtime/queue";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({
      ok: true,
      ...(await dispatchEmailRuntimeJobs()),
    });
  } catch (error) {
    console.error("[email-runtime/dispatch]", error);
    return NextResponse.json(
      { error: "Email dispatch failed" },
      { status: 500 }
    );
  }
}
