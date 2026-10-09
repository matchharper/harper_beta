import { NextResponse } from "next/server";
import { WorkspaceBillingError, billingErrorCopy } from "./types";

export function billingErrorResponse(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "";
  const code =
    error instanceof WorkspaceBillingError
      ? error.code
      : message.includes("workspace_credits_exhausted")
        ? "credits_exhausted"
        : message.includes("workspace_role_capacity_exceeded")
          ? "role_capacity_exceeded"
          : null;
  if (!code) return null;
  return NextResponse.json(
    { error: billingErrorCopy(code, "ko"), billingCode: code },
    { status: error instanceof WorkspaceBillingError ? error.status : 409 }
  );
}
