import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

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

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

type DeductCreditsBody = {
  amount?: number;
  eventType?: string;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DeductCreditsBody;
  try {
    body = (await req.json()) as DeductCreditsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = Number(body?.amount ?? 0);
  const eventType = String(body?.eventType ?? "").trim();

  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  if (!eventType) {
    return NextResponse.json({ error: "Missing event type" }, { status: 400 });
  }

  const supabaseUser = getSupabaseUserClient(accessToken);
  const { data: newBalance, error: deductError } = await supabaseUser.rpc(
    "deduct_user_credits",
    {
      amount_to_deduct: amount,
    }
  );

  if (deductError) {
    const message = deductError.message ?? "Failed to deduct credits";
    const status = message.includes("Insufficient credits") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (supabaseAdmin) {
    const { error: historyError } = await supabaseAdmin
      .from("credits_history")
      .insert({
        user_id: user.id,
        charged_credits: amount,
        event_type: eventType,
      });

    if (historyError) {
      console.error("credits history insert failed:", historyError);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      newBalance: Number(newBalance ?? 0),
    },
    { status: 200 }
  );
}
