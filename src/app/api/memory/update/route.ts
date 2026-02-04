import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { xaiInference } from "@/lib/llm/llm";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_MEMORY_CHARS = 800;

function buildConversationText(rows: Array<{ role: number | null; content: string | null }>) {
  const roleMap = ["User", "Assistant"] as const;
  return rows
    .map((row) => {
      const role = roleMap[row.role ?? 0] ?? "User";
      const content = (row.content ?? "").trim();
      if (!content) return "";
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");
}

function safeParseJson(raw: string) {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export async function POST(req: Request) {
  try {
    const { userId, queryId } = await req.json();
    if (!userId || !queryId) {
      return NextResponse.json({ error: "userId and queryId are required" }, { status: 400 });
    }

    const { data: messages, error: messageError } = await supabaseAdmin
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .eq("query_id", queryId)
      .order("created_at", { ascending: true });

    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    const conversationText = buildConversationText(messages ?? []);
    if (!conversationText) {
      return NextResponse.json({ updated: false, reason: "no_messages" });
    }

    const { data: memoryRow, error: memoryError } = await supabaseAdmin
      .from("memory")
      .select("id, content, created_at, last_updated_at")
      .eq("user_id", userId)
      .order("last_updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (memoryError) {
      return NextResponse.json({ error: memoryError.message }, { status: 500 });
    }

    const currentMemory = (memoryRow?.content ?? "").trim();

    const systemPrompt = `You update team memory for a recruiting assistant.
Memory is about the user's team (culture, what they build, team size, preferred talent).
Do NOT store role-specific requirements or search criteria for a single opening.
If the conversation does not add or clarify team info, do not update.

Output JSON only with keys:
- should_update: boolean
- memory: string (full updated memory). If should_update is false, memory must be an empty string.

Memory must be concise Korean, neutral tone, max 600 chars.`;

    const userPrompt = `Current memory:
${currentMemory.length > 0 ? currentMemory : "(none)"}

Conversation:
${conversationText}`;

    const raw = await xaiInference(
      "grok-4-fast-reasoning",
      systemPrompt,
      userPrompt,
      0.2
    );

    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed.should_update !== "boolean") {
      return NextResponse.json({ updated: false, reason: "parse_failed" });
    }

    if (!parsed.should_update) {
      return NextResponse.json({ updated: false });
    }

    const nextMemory = String(parsed.memory ?? "").trim();
    if (!nextMemory) {
      return NextResponse.json({ updated: false, reason: "empty_memory" });
    }

    const trimmedMemory = nextMemory.slice(0, MAX_MEMORY_CHARS);
    const now = new Date().toISOString();

    if (memoryRow?.id) {
      const { error: updateError } = await supabaseAdmin
        .from("memory")
        .update({ content: trimmedMemory, last_updated_at: now })
        .eq("id", memoryRow.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("memory")
        .insert({ user_id: userId, content: trimmedMemory, last_updated_at: now });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ updated: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
