import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { loadVersionedLegalDocument } from "@/lib/legalDocs.server";
import type { LegalDocumentAcceptanceType } from "@/lib/legal/legalDocumentAcceptance";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

type AcceptanceBody = {
  acceptanceType?: unknown;
  context?: unknown;
  contextKey?: unknown;
  documentLocale?: unknown;
  documentSlug?: unknown;
  documentVersion?: unknown;
  source?: unknown;
};

type UntypedAdmin = ReturnType<typeof getTalentSupabaseAdmin> & {
  from: (table: string) => any;
};

function toUntypedAdmin(
  admin: ReturnType<typeof getTalentSupabaseAdmin>
): UntypedAdmin {
  return admin as UntypedAdmin;
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function normalizeContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 4000) {
    throw new Error("Legal acceptance context is too large");
  }
  return value as Record<string, unknown>;
}

function normalizeAcceptanceBody(body: AcceptanceBody) {
  const acceptanceType = normalizeText(body.acceptanceType, 32);
  const documentLocale = normalizeText(body.documentLocale, 8);
  const documentSlug = normalizeText(body.documentSlug, 120);
  const documentVersion = normalizeText(body.documentVersion, 40);
  const source = normalizeText(body.source, 80);

  if (
    (acceptanceType !== "acknowledgement" && acceptanceType !== "consent") ||
    (documentLocale !== "ko" && documentLocale !== "en") ||
    !/^[a-z0-9][a-z0-9-]{0,119}$/.test(documentSlug) ||
    !documentVersion ||
    !source
  ) {
    return null;
  }

  return {
    acceptanceType: acceptanceType as LegalDocumentAcceptanceType,
    context: normalizeContext(body.context),
    contextKey: normalizeText(body.contextKey, 200),
    documentLocale: documentLocale as "ko" | "en",
    documentSlug,
    documentVersion,
    source,
  };
}

function hashDocument(args: {
  body: string;
  context: Record<string, unknown>;
  description: string;
  effectiveDate: string;
  locale: string;
  slug: string;
  title: string;
  version: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        body: args.body,
        context: args.context,
        description: args.description,
        effectiveDate: args.effectiveDate,
        locale: args.locale,
        slug: args.slug,
        title: args.title,
        version: args.version,
      })
    )
    .digest("hex");
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const { data, error } = await admin
    .from("legal_document_acceptances")
    .select(
      "id, document_slug, document_version, document_locale, acceptance_type, context_key, document_title, document_effective_date, document_sha256, source, context, accepted_at, withdrawn_at"
    )
    .eq("user_id", user.id)
    .order("accepted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ acceptances: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AcceptanceBody;
    const acceptance = normalizeAcceptanceBody(body);
    if (!acceptance) {
      return NextResponse.json(
        { error: "Invalid legal acceptance" },
        { status: 400 }
      );
    }

    let document;
    try {
      document = await loadVersionedLegalDocument(
        acceptance.documentSlug,
        acceptance.documentLocale,
        acceptance.documentVersion
      );
    } catch {
      return NextResponse.json(
        { error: "Legal document version not found" },
        { status: 400 }
      );
    }

    const admin = toUntypedAdmin(getTalentSupabaseAdmin());
    const row = {
      acceptance_type: acceptance.acceptanceType,
      context: acceptance.context,
      context_key: acceptance.contextKey,
      document_effective_date: document.effectiveDate || null,
      document_locale: document.locale,
      document_sha256: hashDocument({
        body: document.body,
        context: acceptance.context,
        description: document.description,
        effectiveDate: document.effectiveDate,
        locale: document.locale,
        slug: document.slug,
        title: document.title,
        version: document.version,
      }),
      document_slug: document.slug,
      document_title: document.title,
      document_version: document.version,
      source: acceptance.source,
      user_id: user.id,
    };
    const { data, error } = await admin
      .from("legal_document_acceptances")
      .upsert(row, {
        ignoreDuplicates: true,
        onConflict:
          "user_id,document_slug,document_version,document_locale,acceptance_type,context_key",
      })
      .select("id, accepted_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ acceptance: data ?? null, ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to record legal acceptance",
      },
      { status: 500 }
    );
  }
}
