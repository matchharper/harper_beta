import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { xaiInference } from "@/lib/llm/llm";

export const runtime = "nodejs";

const DEFAULT_TITLE = "Scout";
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 500;
const UI_BLOCK_PATTERN = /<<UI>>[\s\S]*?<<END_UI>>/g;

type MessageRow = {
  role: number | null;
  content: string | null;
  created_at?: string | null;
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function sanitizeMessageContent(raw: string | null | undefined) {
  const text = String(raw ?? "")
    .replace(UI_BLOCK_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length > MAX_MESSAGE_CHARS) {
    return `${text.slice(0, MAX_MESSAGE_CHARS)}...`;
  }
  return text;
}

function buildConversationText(rows: MessageRow[]) {
  const roleMap = ["User", "Assistant"] as const;
  return rows
    .map((row) => {
      const content = sanitizeMessageContent(row.content);
      if (!content) return "";
      const role = roleMap[row.role ?? 0] ?? "User";
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeGeneratedTitle(raw: string) {
  const firstLine = String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return DEFAULT_TITLE;

  let cleaned = firstLine
    .replace(/^(title|제목)\s*[:：-]\s*/i, "")
    .replace(/[`"'*#]/g, " ")
    .replace(/[.,!?;:()[\]{}<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return DEFAULT_TITLE;

  let words = cleaned.split(" ").filter(Boolean);
  if (words.length > 4) {
    words = words.slice(0, 4);
  } else if (words.length < 2) {
    words = [words[0], "인재"];
  }

  cleaned = words.join(" ").trim();
  if (!cleaned) return DEFAULT_TITLE;

  if (cleaned.length > 40) {
    cleaned = cleaned.slice(0, 40).trim();
  }

  return cleaned || DEFAULT_TITLE;
}

export async function POST(req: Request) {
  try {
    const { userId, queryId } = await req.json();
    if (!userId || !queryId) {
      return NextResponse.json(
        { error: "userId and queryId are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .eq("query_id", queryId)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const latestMessages = ((data ?? []) as MessageRow[]).reverse();
    const conversationText = buildConversationText(latestMessages);
    if (!conversationText) {
      return NextResponse.json({ title: DEFAULT_TITLE }, { status: 200 });
    }

    const systemPrompt = `You create a short title for a recruiting automation from a conversation.
Return only the title text.

Rules:
- Exactly 2 to 4 words.
- Keep it concise and specific to the target candidate profile.
- Prefer Korean, but English tech terms are allowed when natural.
- No quotes, markdown, emoji, or trailing punctuation.
- Max 40 characters.`;

    const userPrompt = `Based on the recent conversation below, generate one title.

Conversation:
${conversationText}

Output title only.`;

    const rawTitle = await xaiInference(
      "grok-4-fast-reasoning",
      systemPrompt,
      userPrompt,
      0.2
    );

    const title = normalizeGeneratedTitle(rawTitle);
    return NextResponse.json({ title }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error", title: DEFAULT_TITLE },
      { status: 500 }
    );
  }
}
