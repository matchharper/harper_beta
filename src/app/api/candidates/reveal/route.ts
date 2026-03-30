import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function getBearerToken(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function getSupabaseUserClient(accessToken: string) {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
}

function normalizeCandidIds(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function isInsufficientCreditError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("insufficient") || message.includes("부족");
}

function getRevealErrorStatus(message: string) {
  if (isInsufficientCreditError(message)) return 400;
  if (message === "Unauthorized") return 401;
  return 500;
}

function getRevealErrorMessage(message: string) {
  if (isInsufficientCreditError(message)) {
    return "남은 열람 횟수가 부족합니다.";
  }

  if (message === "Unauthorized") {
    return "로그인이 필요합니다.";
  }

  return "프로필 열람에 실패했습니다.";
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: { candidId?: string; candidIds?: string[] };
  try {
    body = (await req.json()) as { candidId?: string; candidIds?: string[] };
  } catch {
    return NextResponse.json(
      { error: "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const candidIds = normalizeCandidIds(body?.candidIds);
  const candidId = String(body?.candidId ?? "").trim();
  const targetIds = candidIds.length > 0 ? candidIds : candidId ? [candidId] : [];

  if (targetIds.length === 0) {
    return NextResponse.json(
      { error: "열람할 프로필이 없습니다." },
      { status: 400 }
    );
  }

  try {
    const supabaseUser = getSupabaseUserClient(accessToken);

    if (targetIds.length === 1) {
      const { data, error } = await supabaseUser.rpc(
        "reveal_candidate_profile" as any,
        {
          target_candid_id: targetIds[0],
        } as any
      );

      if (error) {
        const message = error.message ?? "Failed to reveal candidate profile";
        return NextResponse.json(
          { error: getRevealErrorMessage(message) },
          { status: getRevealErrorStatus(message) }
        );
      }

      const row = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({
        ok: true,
        alreadyRevealed: Boolean(row?.already_revealed),
        newBalance: Number(row?.new_balance ?? 0),
      });
    }

    const { data: creditRow, error: creditError } = await supabaseUser
      .from("credits")
      .select("remain_credit")
      .eq("user_id", user.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (creditError) {
      return NextResponse.json(
        { error: creditError.message ?? "열람 횟수 정보를 불러오지 못했습니다." },
        { status: 500 }
      );
    }

    const { data: revealRows, error: revealError } = await ((supabaseUser.from(
      "unlock_profile" as any
    ) as any)
      .select("candid_id")
      .eq("company_user_id", user.id)
      .in("candid_id", targetIds));

    if (revealError) {
      return NextResponse.json(
        { error: revealError.message ?? "열람 상태를 불러오지 못했습니다." },
        { status: 500 }
      );
    }

    const alreadyOpenedIds = new Set(
      (revealRows ?? [])
        .map((row: any) => String(row?.candid_id ?? "").trim())
        .filter(Boolean)
    );
    const unopenedIds = targetIds.filter((id) => !alreadyOpenedIds.has(id));
    const remainCredit = Number(creditRow?.remain_credit ?? 0);

    if (unopenedIds.length > remainCredit) {
      return NextResponse.json(
        {
          error: `남은 열람 횟수가 부족합니다. 현재 페이지의 미열람 프로필 ${unopenedIds.length}개를 열람하려면 더 많은 열람 횟수가 필요합니다.`,
        },
        { status: 400 }
      );
    }

    let revealedCount = 0;
    let alreadyRevealedCount = 0;
    let newBalance = remainCredit;

    for (const targetId of targetIds) {
      const { data, error } = await supabaseUser.rpc(
        "reveal_candidate_profile" as any,
        {
          target_candid_id: targetId,
        } as any
      );

      if (error) {
        const message = error.message ?? "Failed to reveal candidate profile";
        return NextResponse.json(
          { error: getRevealErrorMessage(message) },
          { status: getRevealErrorStatus(message) }
        );
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (Boolean(row?.already_revealed)) {
        alreadyRevealedCount += 1;
      } else {
        revealedCount += 1;
      }
      newBalance = Number(row?.new_balance ?? newBalance);
    }

    return NextResponse.json({
      ok: true,
      totalCount: targetIds.length,
      revealedCount,
      alreadyRevealedCount,
      newBalance,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "프로필 열람 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
