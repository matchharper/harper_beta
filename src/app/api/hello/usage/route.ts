import { NextRequest, NextResponse } from "next/server";
import { notifyUsageSlack } from "../utils";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;
  await notifyUsageSlack(message);
  return NextResponse.json({ message: "POST 요청 성공!", data: body });
}
