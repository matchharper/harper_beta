import { createHash, randomUUID } from "crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchActiveTalentDocumentByOrigin } from "@/lib/talentOnboarding/documentStore";
import { TALENT_RESUME_BUCKET, type TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { CAREER_SINGLE_INPUT_TOKEN_LIMIT, fitCareerInputText, readableTextOf } from "./modelInputFit";

export const CAREER_CHAT_PASTE_ORIGIN = "career_chat_paste";

/** Characters of the pasted text kept in the chat bubble beside the file. */
const PREVIEW_CHARS = 1_000;

function previewOf(text: string) {
  if (text.length <= PREVIEW_CHARS) return text;
  const cut = text.slice(0, PREVIEW_CHARS);
  const boundary = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  return `${(boundary > PREVIEW_CHARS / 2 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * A chat input larger than one model input becomes a private document, the
 * same as a file attached to the message: the original is kept in storage,
 * its readable text is the document text the model reads with read_document,
 * and the chat message keeps a short preview. Smaller input returns null and
 * is sent as before. `requestKey` (the client request id) makes a resend reuse
 * the same document.
 */
export async function saveOversizedChatInputAsDocument(args: {
  admin: TalentAdminClient;
  userId: string;
  text: string;
  requestKey: string;
  locale?: string | null;
}): Promise<{ document: TalentDocumentRow; preview: string } | null> {
  const fit = fitCareerInputText(args.text, CAREER_SINGLE_INPUT_TOKEN_LIMIT);
  if (!fit.reduced) return null;
  const readable = readableTextOf(args.text).text;
  const preview = previewOf(readable);
  const existing = await fetchActiveTalentDocumentByOrigin({
    admin: args.admin, userId: args.userId,
    originType: CAREER_CHAT_PASTE_ORIGIN, originId: args.requestKey,
  });
  if (existing) return { document: existing, preview };

  const isPage = /<(?:!doctype|html|body|div|p|span|table|section|article)\b/i.test(args.text);
  const korean = String(args.locale ?? "").toLowerCase().startsWith("ko");
  const fileName = isPage
    ? (korean ? "붙여 넣은 페이지.txt" : "Pasted page.txt")
    : (korean ? "붙여 넣은 글.txt" : "Pasted text.txt");
  // A pasted page keeps its source as plain text: the bucket accepts no HTML,
  // and serving user-supplied markup as a page from our domain could run it.
  const contentType = "text/plain";
  const bytes = Buffer.from(args.text, "utf8");
  const storagePath = `${args.userId}/${Date.now()}_${randomUUID()}_${isPage ? "pasted_page.txt" : "pasted_text.txt"}`;
  const bucket = args.admin.storage.from(TALENT_RESUME_BUCKET);
  const uploaded = await bucket.upload(storagePath, bytes, { contentType, upsert: false });
  if (uploaded.error) throw uploaded.error;

  const { data, error } = await args.admin.from("talent_documents").insert({
    talent_id: args.userId,
    kind: "document",
    file_name: fileName,
    storage_path: storagePath,
    content_type: contentType,
    size_bytes: bytes.length,
    content_sha256: createHash("sha256").update(bytes).digest("hex"),
    extracted_text: readable,
    origin_type: CAREER_CHAT_PASTE_ORIGIN,
    origin_id: args.requestKey,
    is_public: false,
    is_primary: false,
    is_deleted: false,
  }).select("*").maybeSingle();
  if (error || !data) {
    await bucket.remove([storagePath]).catch(() => undefined);
    // A concurrent resend may have saved the same request first.
    const saved = await fetchActiveTalentDocumentByOrigin({
      admin: args.admin, userId: args.userId,
      originType: CAREER_CHAT_PASTE_ORIGIN, originId: args.requestKey,
    });
    if (saved) return { document: saved, preview };
    throw error ?? new Error("Pasted input could not be saved");
  }
  return { document: data as TalentDocumentRow, preview };
}
