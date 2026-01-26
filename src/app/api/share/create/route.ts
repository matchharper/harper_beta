import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // server-only
);

function makeToken() {
    return crypto.randomBytes(24).toString("base64url");
}

function getBaseUrl(req: Request) {
    // Works in local + Vercel + custom domain (most cases)
    const url = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
    return `${proto}://${host}`;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const candidId = body?.candidId as string | undefined;
        const includeChat = !!body?.includeChat;

        if (!candidId) {
            return NextResponse.json({ error: "candidId required" }, { status: 400 });
        }

        // ✅ IMPORTANT: createdBy는 절대 클라에서 받지 말고 서버에서 확정해야 안전함.
        // 지금은 네 인증 로직이 여기 없어서, 일단 막아둠.
        // TODO: Replace with your auth session -> user.id
        const createdBy = body?.createdBy as string | undefined;
        if (!createdBy) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const baseUrl = getBaseUrl(req);
        const nowIso = new Date().toISOString();

        // 1) Existing active share? (not revoked, not expired)
        const { data: existing, error: existingErr } = await supabaseAdmin
            .from("profile_shares")
            .select("token, expires_at")
            .eq("candid_id", candidId)
            .eq("created_by", createdBy)
            .eq("include_chat", includeChat)
            .is("revoked_at", null)
            // expires_at이 null일 수도 있으면, 아래 조건을 빼고 서버에서 체크해도 됨
            .gt("expires_at", nowIso)
            .maybeSingle();

        if (existingErr) {
            return NextResponse.json({ error: existingErr.message }, { status: 500 });
        }

        if (existing?.token) {
            return NextResponse.json({
                url: `${baseUrl}/share/${existing.token}`,
                reused: true,
            });
        }

        // 2) Create new
        const token = makeToken();

        // default expiry: 14 days
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

        const { error: insertErr } = await supabaseAdmin.from("profile_shares").insert({
            token,
            candid_id: candidId,
            created_by: createdBy,
            include_chat: includeChat,
            expires_at: expiresAt,
        });

        if (insertErr) {
            // If you added a partial unique index, two concurrent creates might conflict.
            // In that case, re-fetch and return.
            // (Optional resilience)
            const isUniqueViolation =
                (insertErr as any)?.code === "23505" ||
                String(insertErr.message || "").toLowerCase().includes("duplicate");

            if (isUniqueViolation) {
                const { data: retry } = await supabaseAdmin
                    .from("profile_shares")
                    .select("token")
                    .eq("candid_id", candidId)
                    .eq("created_by", createdBy)
                    .eq("include_chat", includeChat)
                    .is("revoked_at", null)
                    .gt("expires_at", nowIso)
                    .maybeSingle();

                if (retry?.token) {
                    return NextResponse.json({
                        url: `${baseUrl}/share/${retry.token}`,
                        reused: true,
                    });
                }
            }

            return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }

        return NextResponse.json({
            url: `${baseUrl}/share/${token}`,
            reused: false,
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message ?? "Unknown error" },
            { status: 500 }
        );
    }
}
