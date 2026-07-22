import { NextRequest, NextResponse } from "next/server";
import { ChatScope } from "@/hooks/chat/useChatSession";
import {
  hasSerializedAttachments,
  stripSerializedAttachmentBlocks,
} from "@/lib/chat/attachments";
import { buildLongDoc } from "@/utils/textprocess";
import { logger } from "@/utils/logger";
import { CANDID_SYSTEM_PROMPT, SYSTEM_PROMPT } from "./chat_prompt";
import { createXaiGeminiOpenAIReadableStream } from "./streamProviders";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AttachmentPayload = {
  kind?: "file" | "link";
  name: string;
  text: string;
  size?: number;
  mime?: string;
  excerpt?: string;
  truncated?: boolean;
  url?: string;
};

const MAX_ATTACHMENT_CHARS = 12000;
const LONG_FORM_FIRST_QUERY_THRESHOLD = 500;
const FIRST_LONG_FORM_QUERY_PROMPT = `
### Long-form First Query Handling
- 올려진 자격요건을 그대로 criteria로 만들지 말고, 몇가지 조건을 섞거나 합치거나 해서 한 criteria로 여러개가 판단이 된다면 묶어서 하나로 표현. 그리고 우대사항, 주요업무, 팀의 문화 등도 반영할 것.
- 이 경우에는 criteria를 최대 8개 까지 허용한다.
- 특히 지나치게 구체적인 기술 스택의 사용 같은 경우, 대신 그 기술 스택을 주로 쓰는 직무를 criteria로 넣을 수 있다.
- 검색으로는 판단 불가능하고 인터뷰/서류에서 봐야 하는 조건은 배제해라.
- When the very first user message is long or includes attached references, compress it into a crisp search plan instead of mirroring every detail.
- Separate must-have criteria from nice-to-have criteria carefully.
- If a criterion is helpful but not strictly required, prefix that criterion with "(우대사항) ".
- Never prefix mandatory criteria with "(우대사항) ".
`;

function clampText(s: string, maxChars: number) {
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n...[truncated ${s.length - maxChars} chars]`;
}

function shouldApplyLongFormFirstQueryPrompt(args: {
  attachments: AttachmentPayload[];
  messages: ChatMessage[];
}) {
  const assistantCount = args.messages.filter(
    (message) => message.role === "assistant"
  ).length;
  if (assistantCount > 0) return false;

  const firstUserMessage = [...args.messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!firstUserMessage?.content) return false;

  const plainText = stripSerializedAttachmentBlocks(firstUserMessage.content);
  const hasAttachmentInMessage = hasSerializedAttachments(
    firstUserMessage.content
  );

  return (
    args.attachments.length > 0 ||
    hasAttachmentInMessage ||
    plainText.length > LONG_FORM_FIRST_QUERY_THRESHOLD
  );
}

export async function POST(req: NextRequest) {
  try {
    if (req.method !== "POST") {
      return NextResponse.json(
        { error: "Method not allowed" },
        { status: 405 }
      );
    }

    const body = (await req.json()) as {
      model?: string;
      messages?: ChatMessage[];
      scope?: ChatScope;
      doc?: any;
      attachments?: AttachmentPayload[];
    };

    const model = body.model ?? "grok-4-fast-reasoning";

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) {
      return NextResponse.json({ error: "Missing messages" }, { status: 400 });
    }

    let systemPrompt = "";
    if (body.scope?.type === "candid") {
      const information = buildLongDoc(body.doc);
      systemPrompt =
        CANDID_SYSTEM_PROMPT +
        `### Candidate Information
${information}
`;
    }

    if (body.scope?.type === "query") {
      systemPrompt = SYSTEM_PROMPT;
    }

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((a, idx) => {
          const safeText = clampText(
            String(a.text ?? ""),
            MAX_ATTACHMENT_CHARS
          );
          return `### Attachment ${idx + 1}: ${a.name ?? "파일"}\n${
            a.kind ? `Kind: ${a.kind}\n` : ""
          }${a.url ? `URL: ${a.url}\n` : ""}${a.mime ? `Type: ${a.mime}\n` : ""}${
            a.size ? `Size: ${a.size} bytes\n` : ""
          }\n${safeText}`;
        })
        .join("\n\n");

      systemPrompt += `\n\n### Attachments (User-provided)\n${attachmentText}\n\nInstructions:\n- Use the attachment content to answer the user's request.\n- If the attachment is insufficient, ask a concise follow-up question.\n`;
    }

    if (
      body.scope?.type === "query" &&
      shouldApplyLongFormFirstQueryPrompt({ attachments, messages })
    ) {
      systemPrompt += `\n\n${FIRST_LONG_FORM_QUERY_PROMPT}`;
    }

    const systemMsg = systemPrompt;
    const baseMsgs = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const { stream } = await createXaiGeminiOpenAIReadableStream({
      model: model,
      systemPrompt: systemMsg,
      messages: baseMsgs,
      temperature: 0.5,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    logger.log("/api/chat POST failed:", error);
    return NextResponse.json(
      { error: String(error?.message ?? "Internal server error") },
      { status: 500 }
    );
  }
}
