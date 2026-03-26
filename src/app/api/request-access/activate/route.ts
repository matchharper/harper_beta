import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { activateRequestAccess } from "@/lib/requestAccess/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(body?.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const result = await activateRequestAccess({
      token,
      userId: user.id,
      email: user.email,
    });

    if (!result.ok) {
      const status =
        result.code === "wrong_user"
          ? 403
          : result.code === "invalid_token" || result.code === "not_approved"
            ? 404
            : 400;

      return NextResponse.json({ error: result.code }, { status });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to activate access",
      },
      { status: 500 }
    );
  }
}
