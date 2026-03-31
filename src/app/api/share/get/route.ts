import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    applyDetailRevealState,
    fetchRevealMapForUser,
} from "@/lib/server/candidateAccess";

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

export async function GET(req: Request) {
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { searchParams } = new URL(req.url);
        const token = searchParams.get("token") || "";
        if (!token) {
            return NextResponse.json({ error: "token required" }, { status: 400 });
        }

        const { data: share, error: shareErr } = await supabaseAdmin
            .from("profile_shares")
            .select("candid_id, created_by, include_chat, revoked_at, expires_at")
            .eq("token", token)
            .maybeSingle();

        if (shareErr) return NextResponse.json({ error: shareErr.message }, { status: 500 });
        if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const now = Date.now();
        if (share.revoked_at) return NextResponse.json({ error: "Revoked" }, { status: 410 });
        if (share.expires_at && new Date(share.expires_at).getTime() < now)
            return NextResponse.json({ error: "Expired" }, { status: 410 });

        // 공유용으로 최소 필드만 (민감정보 제외)
        const { data: candid, error: candidErr } = await supabaseAdmin
            .from("candid")
            .select("id,name,headline,location,bio,profile_picture,total_exp_months,links, summary(*), edu_user(*), experience_user(*, company_db(*)), publications(*)")
            .eq("id", share.candid_id)
            .maybeSingle();

        if (candidErr) return NextResponse.json({ error: candidErr.message }, { status: 500 });
        if (!candid) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

        const revealMap = await fetchRevealMapForUser(
            supabaseAdmin as any,
            String(share.created_by ?? ""),
            [String(share.candid_id ?? "")]
        );
        const isRevealed = revealMap.get(String(share.candid_id ?? "")) === true;

        let messages: any[] = [];
        if (share.include_chat && isRevealed) {
            // ⚠️ 너 테이블 스키마에 맞게 수정 필요
            const { data: msgs, error: msgErr } = await supabaseAdmin
                .from("messages")
                .select("id,role,content,created_at")
                .eq("user_id", share.created_by)
                .eq("candid_id", share.candid_id)
                .order("created_at", { ascending: true });

            if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
            messages = msgs ?? [];
        }

        return NextResponse.json({
            candid: applyDetailRevealState(candid, isRevealed),
            include_chat: share.include_chat,
            messages,
        });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message ?? "Unknown error" },
            { status: 500 }
        );
    }
}
