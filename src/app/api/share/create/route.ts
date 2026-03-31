import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabaseServer";
import { fetchRevealMapForUser } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Server misconfigured: missing Supabase admin credentials");
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

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

export async function POST(req: NextRequest) {
    try {
        const user = await getRequestUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabaseAdmin = getSupabaseAdmin();
        const body = await req.json();

        const candidId = body?.candidId as string | undefined;
        const includeChat = !!body?.includeChat;

        if (!candidId) {
            return NextResponse.json({ error: "candidId required" }, { status: 400 });
        }

        const createdBy = user.id;
        const revealMap = await fetchRevealMapForUser(supabaseAdmin as any, createdBy, [candidId]);
        if (revealMap.get(candidId) !== true) {
            return NextResponse.json(
                { error: "이 후보자 프로필을 먼저 열람해 주세요." },
                { status: 400 }
            );
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
