import { NextResponse } from "next/server";
import { dispatchCompanyConnectionEmails } from "@/lib/email/companyConnectionDelivery";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  const secret=process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization")!==`Bearer ${secret}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  try { return NextResponse.json({ok:true,...await dispatchCompanyConnectionEmails()}); }
  catch (error) { console.error("[company-email/dispatch]",error); return NextResponse.json({error:"Company email dispatch failed"},{status:500}); }
}
