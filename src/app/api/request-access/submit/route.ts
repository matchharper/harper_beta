import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { submitRequestAccess } from "@/lib/requestAccess/server";

export const runtime = "nodejs";

type RequestAccessBody = {
  name?: string;
  company?: string;
  role?: string;
  hiringNeed?: string;
  isMobile?: boolean | null;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestAccessBody;
  try {
    body = (await req.json()) as RequestAccessBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "Signed-in user must have an email" },
      { status: 400 }
    );
  }

  try {
    await submitRequestAccess({
      req,
      userId: user.id,
      email,
      name: String(body?.name ?? ""),
      company: String(body?.company ?? ""),
      role: String(body?.role ?? ""),
      hiringNeed: String(body?.hiringNeed ?? ""),
      isMobile:
        typeof body?.isMobile === "boolean" ? body.isMobile : body?.isMobile,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to submit request access",
      },
      { status: 500 }
    );
  }
}
