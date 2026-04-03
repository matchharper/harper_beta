import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  ATS_ALLOWED_EMAILS,
  INTERNAL_EMAIL_DOMAIN,
  canAccessAts,
  isInternalEmail,
} from "@/lib/internalAccess";
import { getRequestUser } from "@/lib/supabaseServer";

export class InternalApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "InternalApiError";
    this.status = status;
  }
}

export async function requireInternalApiUser(
  req: NextRequest
): Promise<User> {
  const user = await getRequestUser(req);
  if (!user) {
    throw new InternalApiError(401, "Unauthorized");
  }

  if (!isInternalEmail(user.email)) {
    throw new InternalApiError(
      403,
      `Forbidden: ${INTERNAL_EMAIL_DOMAIN} email required`
    );
  }

  return user;
}

export async function requireAtsApiUser(req: NextRequest): Promise<User> {
  const user = await getRequestUser(req);
  if (!user) {
    throw new InternalApiError(401, "Unauthorized");
  }

  if (!canAccessAts(user.email)) {
    throw new InternalApiError(
      403,
      `Forbidden: ${INTERNAL_EMAIL_DOMAIN} or ${ATS_ALLOWED_EMAILS.join(", ")} required for ATS`
    );
  }

  return user;
}

export function toInternalApiErrorResponse(
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof InternalApiError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 }
  );
}
