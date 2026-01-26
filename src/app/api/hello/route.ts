// src/app/api/hello/route.ts
import { NextRequest, NextResponse } from "next/server";
import { notifySlack } from "./utils";

export async function GET(req: NextRequest) {
  return NextResponse.json({ message: "GET 요청 성공!", response: "hello" });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;
  await notifySlack(message);
  return NextResponse.json({ message: "POST 요청 성공!", data: body });
}
