import { NextResponse } from "next/server";
import { WorkspaceBillingError, billingErrorCode, billingErrorCopy } from "./types";

export function billingErrorResponse(error: unknown) {
  const code = billingErrorCode(error);
  if (!code) return null;
  return NextResponse.json(
    { error: billingErrorCopy(code, "ko"), billingCode: code },
    { status: error instanceof WorkspaceBillingError ? error.status : 409 }
  );
}
