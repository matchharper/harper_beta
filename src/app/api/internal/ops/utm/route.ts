import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  requireOpsUtmApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { isInternalEmail } from "@/lib/internalAccess";
import {
  OPS_UTM_DIMENSIONS,
  parseOpsUtmFilters,
  parseOpsUtmGranularity,
  parseOpsUtmPeriod,
} from "@/lib/ops/utm";
import {
  fetchOpsUtmSourceDetail,
  fetchOpsUtmSources,
  parseOpsUtmSourceMutation,
  toOpsUtmRegisteredSourceRow,
} from "@/lib/ops/utmServer";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CareerUtmSourceInsert =
  Database["public"]["Tables"]["career_utm_sources"]["Insert"];
type CareerUtmSourceUpdate =
  Database["public"]["Tables"]["career_utm_sources"]["Update"];

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireOpsUtmApiUser(req);
    const access = isInternalEmail(user.email) ? "internal" : "viewer";
    const source = req.nextUrl.searchParams.get("source");
    const excludedEmails = req.nextUrl.searchParams.getAll("excludedEmail");

    if (source) {
      const filters = parseOpsUtmFilters(
        Object.fromEntries(
          OPS_UTM_DIMENSIONS.map((key) => [
            key,
            req.nextUrl.searchParams.get(key),
          ])
        )
      );
      return NextResponse.json(
        await fetchOpsUtmSourceDetail({
          access,
          excludedEmails,
          filters,
          granularity: parseOpsUtmGranularity(
            req.nextUrl.searchParams.get("granularity")
          ),
          period: parseOpsUtmPeriod(req.nextUrl.searchParams.get("period")),
          source,
        })
      );
    }

    return NextResponse.json(
      await fetchOpsUtmSources({
        access,
        excludedEmails,
        limit: numberParam(req.nextUrl.searchParams.get("limit"), 30),
        offset: numberParam(req.nextUrl.searchParams.get("offset"), 0),
        query: req.nextUrl.searchParams.get("query"),
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load UTM analytics");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = parseOpsUtmSourceMutation(
      await req.json().catch(() => null)
    );
    const insert: CareerUtmSourceInsert = {
      description: payload.description,
      source: payload.source,
    };
    const { data, error } = await supabaseServer
      .from("career_utm_sources")
      .insert(insert)
      .select("id,source,description,created_at,updated_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Source 생성 실패");
    return NextResponse.json({ source: toOpsUtmRegisteredSourceRow(data) });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to create UTM source");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = parseOpsUtmSourceMutation(
      await req.json().catch(() => null)
    );
    if (!payload.id) {
      return NextResponse.json(
        { error: "Source id가 필요합니다." },
        { status: 400 }
      );
    }
    const update: CareerUtmSourceUpdate = {
      description: payload.description,
      source: payload.source,
    };
    const { data, error } = await supabaseServer
      .from("career_utm_sources")
      .update(update)
      .eq("id", payload.id)
      .select("id,source,description,created_at,updated_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Source 수정 실패");
    return NextResponse.json({ source: toOpsUtmRegisteredSourceRow(data) });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update UTM source");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    const id = String(body?.id ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { error: "Source id가 필요합니다." },
        { status: 400 }
      );
    }
    const { error } = await supabaseServer
      .from("career_utm_sources")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to delete UTM source");
  }
}
