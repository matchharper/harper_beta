import { buildAutoIntroCandidateProfileUrl } from "@/lib/ops/autoIntroToCompanyMessage";
import { getDisplayableProfileImageUrl } from "@/lib/imageUrl";
import { DEFAULT_ORG_STOP_REASONS } from "@/lib/org/candidateDecision";

export const HARPER_TALENT_REVIEW_ACTION_PREFIX = "harper_talent_review:";
export const HARPER_TALENT_REVIEW_OPEN_ACTION_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}open`;
export const HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}accept`;
export const HARPER_TALENT_REVIEW_REJECT_ACTION_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}reject`;
export const HARPER_TALENT_REVIEW_PREVIOUS_ACTION_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}previous`;
export const HARPER_TALENT_REVIEW_NEXT_ACTION_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}next`;
export const HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}accept_confirm`;
export const HARPER_TALENT_REVIEW_REJECT_CALLBACK_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}reject_confirm`;
export const HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID = `${HARPER_TALENT_REVIEW_ACTION_PREFIX}connection_mode`;

export type SlackTalentReviewConnectionMode = "cc_intro" | "contact_directly";

export type SlackTalentReviewCandidateRef = {
  displayName: string;
  recommendationId: string | null;
  roleId: string;
  talentId: string;
};

export type SlackTalentReviewExperience = {
  companyLogo: string | null;
  companyLocation: string | null;
  companyName: string | null;
  description: string | null;
  employmentType: string | null;
  endDate: string | null;
  memo: string | null;
  role: string | null;
  startDate: string | null;
};

export type SlackTalentReviewEducation = {
  degree: string | null;
  description: string | null;
  endDate: string | null;
  field: string | null;
  memo: string | null;
  school: string | null;
  startDate: string | null;
};

export type SlackTalentReviewExtra = {
  date: string | null;
  description: string | null;
  memo: string | null;
  title: string | null;
};

export type SlackTalentReviewCandidate = {
  bio: string | null;
  documents: string[];
  educations: SlackTalentReviewEducation[];
  email: string | null;
  experiences: SlackTalentReviewExperience[];
  extras: SlackTalentReviewExtra[];
  location: string | null;
  name: string;
  profilePicture: string | null;
  reason: string | null;
  recommendationId: string | null;
  registeredLinks: string[];
  roleId: string;
  roleName: string;
  talentId: string;
  workspaceId: string;
};

export type SlackTalentReviewViewMetadata = {
  candidateIndex: number;
  sourceMessageId: number;
  workspaceId: string;
};

export type SlackTalentReviewDecisionMember = {
  email: string;
  name: string | null;
};

export type SlackTalentReviewViewState = {
  values?: Record<
    string,
    Record<
      string,
      {
        selected_option?: { value?: string } | null;
        selected_options?: Array<{ value?: string }>;
        value?: string | null;
      }
    >
  >;
};

export type SlackTalentReviewDecisionSubmission =
  | {
      acceptReason: string | null;
      connectionMode: SlackTalentReviewConnectionMode;
      decision: "accept";
      introEmails: string[];
    }
  | {
      decision: "reject";
      stopNote: string | null;
    };

export type SlackModalView = Record<string, unknown>;

const MAX_PROFILE_ITEMS = 24;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function escapeMrkdwn(value: unknown) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeSlackLink(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\|/g, "%7C");
  } catch {
    return null;
  }
}

export function markdownToSlackMrkdwn(value: unknown) {
  let source = clean(value).replace(/\r\n?/g, "\n");
  if (!source) return "";

  const tokens: string[] = [];
  const hold = (rendered: string) => {
    const token = `\u0000HARPER_SLACK_TOKEN_${tokens.length}\u0000`;
    tokens.push(rendered);
    return token;
  };

  source = source.replace(/```[^\n]*\n([\s\S]*?)```/g, (_match, code: string) =>
    hold(`\`\`\`${escapeMrkdwn(code)}\`\`\``)
  );
  source = source.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    hold(`\`${escapeMrkdwn(code)}\``)
  );
  source = source.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    (match, label: string, href: string) => {
      const url = safeSlackLink(href);
      return url ? hold(`<${url}|${escapeMrkdwn(label || "이미지")}>`) : match;
    }
  );
  source = source.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (match, label: string, href: string) => {
      const url = safeSlackLink(href);
      return url ? hold(`<${url}|${escapeMrkdwn(label)}>`) : match;
    }
  );

  source = escapeMrkdwn(source);
  source = source
    .replace(/^\s*[-+*]\s+\[x\]\s+/gim, "• ☑ ")
    .replace(/^\s*[-+*]\s+\[\s\]\s+/gim, "• ☐ ")
    .replace(/^\s*[-+*]\s+/gm, "• ")
    .replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, (_match, content: string) =>
      hold(`*${content}*`)
    )
    .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, "────────")
    .replace(/~~([^~\n]+)~~/g, "~$1~")
    .replace(/\*\*([^*\n]+)\*\*/g, (_match, content: string) =>
      hold(`*${content}*`)
    )
    .replace(/__([^_\n]+)__/g, (_match, content: string) =>
      hold(`*${content}*`)
    )
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1_$2_")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return source.replace(
    /\u0000HARPER_SLACK_TOKEN_(\d+)\u0000/g,
    (_match, index: string) => tokens[Number(index)] || ""
  );
}

function truncate(value: unknown, maxLength: number) {
  const normalized = clean(value).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function truncateMrkdwn(value: unknown, maxLength: number) {
  const normalized = clean(value)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  if (normalized.length <= maxLength) return normalized;
  let result = normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  if (result.lastIndexOf("<") > result.lastIndexOf(">")) {
    result = result.slice(0, result.lastIndexOf("<")).trimEnd();
  }
  return `${result.slice(0, maxLength - 1).trimEnd()}…`;
}

function webImageUrl(value: unknown) {
  const candidate = clean(value);
  if (!candidate) return null;
  try {
    const url = new URL(
      candidate,
      `${clean(process.env.NEXT_PUBLIC_SITE_URL) || "https://matchharper.com"}/`
    );
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function slackCardIconUrl(value: unknown) {
  const imageUrl = webImageUrl(value);
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    const publicObjectPrefix = "/storage/v1/object/public/";
    if (url.pathname.includes(publicObjectPrefix)) {
      url.pathname = url.pathname.replace(
        publicObjectPrefix,
        "/storage/v1/render/image/public/"
      );
      url.searchParams.set("height", "72");
      url.searchParams.set("resize", "contain");
      url.searchParams.set("width", "72");
    }
    return url.toString();
  } catch {
    return imageUrl;
  }
}

function textObject(text: string, type: "mrkdwn" | "plain_text" = "mrkdwn") {
  return { text, type };
}

function period(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return null;
  if (startDate && endDate) return `${startDate} – ${endDate}`;
  if (startDate) return `${startDate} – 현재`;
  return endDate;
}

function profileItemText(args: {
  body: string;
  subtitle?: string | null;
  subtext?: string | null;
  title: string;
}) {
  return truncateMrkdwn(
    [
      `*${escapeMrkdwn(truncate(args.title, 150))}*`,
      args.subtitle ? escapeMrkdwn(truncate(args.subtitle, 300)) : "",
      args.subtext ? `_${escapeMrkdwn(truncate(args.subtext, 300))}_` : "",
      args.body,
    ]
      .filter(Boolean)
      .join("\n"),
    2_900
  );
}

function profileItemBody(description: string | null, memo: string | null) {
  return [
    markdownToSlackMrkdwn(description),
    clean(memo) ? `*Harper 메모:* ${markdownToSlackMrkdwn(memo)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function cardTitle(value: string) {
  return textObject(`*${escapeMrkdwn(truncate(value, 150))}*`);
}

function spacedDivider(): Record<string, unknown>[] {
  return [
    {
      elements: [textObject("\u200B", "plain_text")],
      type: "context",
    },
    { type: "divider" },
  ];
}

function experienceBlockGroup(
  item: SlackTalentReviewExperience,
  index: number
): Record<string, unknown>[] {
  const iconUrl = slackCardIconUrl(item.companyLogo);
  const body = profileItemBody(item.description, item.memo);
  const subtitle = [item.role, item.employmentType]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
  const subtext = [
    period(item.startDate, item.endDate),
    clean(item.companyLocation),
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    {
      block_id: `review_experience_${index}_card`,
      ...(iconUrl
        ? {
            icon: {
              alt_text: truncate(item.companyName || "회사", 100),
              image_url: iconUrl,
              type: "image",
            },
          }
        : {}),
      ...(subtitle
        ? { body: textObject(escapeMrkdwn(truncate(subtitle, 200))) }
        : {}),
      ...(subtext
        ? { subtext: textObject(escapeMrkdwn(truncate(subtext, 200))) }
        : {}),
      title: cardTitle(item.companyName || "회사 정보 없음"),
      type: "card",
    },
    ...(body
      ? markdownContextBlocks(body, `review_experience_${index}_description`)
      : []),
  ];
}

function educationBlockGroup(
  item: SlackTalentReviewEducation,
  index: number
): Record<string, unknown>[] {
  const body = profileItemBody(item.description, item.memo);
  const subtitle = [item.degree, item.field]
    .map(clean)
    .filter(Boolean)
    .join(" · ");
  const subtext = period(item.startDate, item.endDate);
  return [
    {
      block_id: `review_education_${index}_card`,
      ...(subtitle
        ? { body: textObject(escapeMrkdwn(truncate(subtitle, 200))) }
        : {}),
      ...(subtext
        ? { subtext: textObject(escapeMrkdwn(truncate(subtext, 200))) }
        : {}),
      title: cardTitle(item.school || "학교 정보 없음"),
      type: "card",
    },
    ...(body
      ? markdownContextBlocks(body, `review_education_${index}_description`)
      : []),
  ];
}

function separatedBlockGroups<T>(
  items: T[],
  buildGroup: (item: T, index: number) => Record<string, unknown>[]
) {
  return items.flatMap((item, index) => [
    ...buildGroup(item, index),
    ...(index < items.length - 1 ? spacedDivider() : []),
  ]);
}

function extraSection(
  item: SlackTalentReviewExtra,
  index: number
): Record<string, unknown> {
  const body = profileItemBody(item.description, item.memo);
  return {
    block_id: `review_extra_${index}`,
    text: textObject(
      profileItemText({
        body,
        subtext: item.date,
        title: item.title || "기타 정보",
      })
    ),
    type: "section",
  };
}

function sectionChunks(value: string, maxLength = 2_900) {
  const chunks: string[] = [];
  let remaining = clean(value);
  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const lineBreak = candidate.lastIndexOf("\n");
    const splitAt = lineBreak > maxLength / 2 ? lineBreak : maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function markdownSections(value: string, prefix: string) {
  return sectionChunks(value).map((text, index) => ({
    block_id: `${prefix}_${index}`,
    text: textObject(text),
    type: "section",
  }));
}

function markdownContextBlocks(value: string, prefix: string) {
  return sectionChunks(value).map((text, index) => ({
    block_id: `${prefix}_${index}`,
    elements: [textObject(text)],
    type: "context",
  }));
}

function registeredMaterials(candidate: SlackTalentReviewCandidate) {
  const rows = candidate.documents.map(
    (document) => `• ${escapeMrkdwn(document)}`
  );
  for (const link of candidate.registeredLinks) {
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      rows.push(`• <${url.toString()}|${escapeMrkdwn(url.hostname)}> `);
    } catch {
      // Invalid profile links are omitted from Slack instead of rendered as text.
    }
  }
  return rows;
}

export function encodeSlackTalentReviewViewMetadata(
  value: SlackTalentReviewViewMetadata
) {
  return JSON.stringify(value);
}

export function decodeSlackTalentReviewViewMetadata(
  value: unknown
): SlackTalentReviewViewMetadata | null {
  try {
    const parsed = JSON.parse(clean(value)) as Record<string, unknown>;
    const candidateIndex = Number(parsed.candidateIndex);
    const sourceMessageId = Number(parsed.sourceMessageId);
    const workspaceId = clean(parsed.workspaceId);
    if (
      !Number.isSafeInteger(candidateIndex) ||
      candidateIndex < 0 ||
      !Number.isSafeInteger(sourceMessageId) ||
      sourceMessageId <= 0 ||
      !workspaceId
    ) {
      return null;
    }
    return { candidateIndex, sourceMessageId, workspaceId };
  } catch {
    return null;
  }
}

export function buildSlackTalentReviewLoadingView(): SlackModalView {
  return {
    blocks: [
      {
        text: textObject("후보자 정보를 불러오고 있습니다."),
        type: "section",
      },
    ],
    close: textObject("닫기", "plain_text"),
    title: textObject("후보자 검토", "plain_text"),
    type: "modal",
  };
}

export function buildSlackTalentReviewAccessDeniedView(): SlackModalView {
  return {
    blocks: [
      {
        text: textObject(
          "*승인된 멤버만 접근할 수 있습니다.*\n이 후보자 정보는 Harper workspace에 등록된 멤버만 확인할 수 있습니다. Workspace 관리자가 이메일로 초대한 뒤, 해당 이메일로 Harper에 가입하면 다시 확인할 수 있습니다."
        ),
        type: "section",
      },
    ],
    close: textObject("닫기", "plain_text"),
    title: textObject("접근 권한 안내", "plain_text"),
    type: "modal",
  };
}

export function buildSlackTalentReviewErrorView(
  message = "후보자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
): SlackModalView {
  return {
    blocks: [
      {
        text: textObject(escapeMrkdwn(message)),
        type: "section",
      },
    ],
    close: textObject("닫기", "plain_text"),
    title: textObject("불러오기 실패", "plain_text"),
    type: "modal",
  };
}

function decisionOption(args: {
  description?: string;
  label: string;
  value: string;
}) {
  return {
    ...(args.description
      ? {
          description: textObject(truncate(args.description, 75), "plain_text"),
        }
      : {}),
    text: textObject(truncate(args.label, 75), "plain_text"),
    value: args.value,
  };
}

function stateAction(
  state: SlackTalentReviewViewState | null | undefined,
  blockId: string,
  actionId: string
) {
  return state?.values?.[blockId]?.[actionId];
}

function uniqueNormalizedEmails(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map(clean)
        .map((value) => value.toLowerCase())
        .filter(Boolean)
    )
  );
}

export function parseSlackTalentReviewDecisionSubmission(args: {
  callbackId: unknown;
  state?: SlackTalentReviewViewState | null;
}):
  | { errors: Record<string, string>; submission?: never }
  | { errors?: never; submission: SlackTalentReviewDecisionSubmission } {
  const callbackId = clean(args.callbackId);
  if (callbackId === HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID) {
    const connectionMode = clean(
      stateAction(
        args.state,
        "review_accept_connection_mode",
        HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID
      )?.selected_option?.value
    );
    if (
      connectionMode !== "cc_intro" &&
      connectionMode !== "contact_directly"
    ) {
      return {
        errors: {
          review_accept_connection_mode: "연결 방식을 선택해 주세요.",
        },
      };
    }
    const introEmails = uniqueNormalizedEmails(
      stateAction(
        args.state,
        "review_accept_intro_members",
        "intro_members"
      )?.selected_options?.map((option) => option.value) ?? []
    );
    if (connectionMode === "cc_intro" && introEmails.length === 0) {
      return {
        errors: {
          review_accept_intro_members:
            "소개 메일에 포함할 회사 멤버를 1명 이상 선택해 주세요.",
        },
      };
    }
    const acceptReason = clean(
      stateAction(args.state, "review_accept_reason", "accept_reason")?.value
    );
    if (acceptReason.length > 2_000) {
      return {
        errors: {
          review_accept_reason:
            "연결 메모는 2,000자 이내로 입력해 주세요.",
        },
      };
    }
    return {
      submission: {
        acceptReason: acceptReason || null,
        connectionMode,
        decision: "accept",
        introEmails: connectionMode === "cc_intro" ? introEmails : [],
      },
    };
  }

  if (callbackId === HARPER_TALENT_REVIEW_REJECT_CALLBACK_ID) {
    const allowedReasons = new Set<string>(DEFAULT_ORG_STOP_REASONS);
    const selectedReasons = Array.from(
      new Set(
        (
          stateAction(args.state, "review_reject_reasons", "reject_reasons")
            ?.selected_options ?? []
        )
          .map((option) => clean(option.value))
          .filter(Boolean)
      )
    );
    if (selectedReasons.some((reason) => !allowedReasons.has(reason))) {
      return {
        errors: {
          review_reject_reasons: "목록에 있는 연결 거절 이유를 선택해 주세요.",
        },
      };
    }
    const note = clean(
      stateAction(args.state, "review_reject_note", "reject_note")?.value
    );
    const stopNote = Array.from(
      new Set([...selectedReasons, ...(note ? [note] : [])])
    ).join("\n");
    if (stopNote.length > 2_000) {
      return {
        errors: {
          review_reject_note:
            "선택한 이유를 포함해 거절 이유는 2,000자 이내로 입력해 주세요.",
        },
      };
    }
    return {
      submission: { decision: "reject", stopNote: stopNote || null },
    };
  }

  return { errors: {} };
}

export function buildSlackTalentReviewAcceptDecisionView(args: {
  actorEmail: string;
  candidate: SlackTalentReviewCandidate;
  candidateCount: number;
  candidateIndex: number;
  connectionMode?: SlackTalentReviewConnectionMode;
  members: SlackTalentReviewDecisionMember[];
  sourceMessageId: number;
}): SlackModalView {
  const connectionMode =
    args.connectionMode ??
    (args.candidate.email ? "cc_intro" : "contact_directly");
  const metadata = encodeSlackTalentReviewViewMetadata({
    candidateIndex: args.candidateIndex,
    sourceMessageId: args.sourceMessageId,
    workspaceId: args.candidate.workspaceId,
  });
  const connectionOptions = [
    decisionOption({
      description: "Harper가 후보자와 선택한 담당자를 소개 메일로 연결합니다.",
      label: "소개 이메일",
      value: "cc_intro",
    }),
    decisionOption({
      description:
        "Harper가 양측을 소개하지 않고 회사 담당자가 후보자에게 직접 연락합니다.",
      label: "직접 연락",
      value: "contact_directly",
    }),
  ];
  const actorEmail = clean(args.actorEmail).toLowerCase();
  const orderedMembers = [
    ...args.members.filter((member) => member.email === actorEmail),
    ...args.members.filter((member) => member.email !== actorEmail),
  ];
  const memberOptions = orderedMembers.slice(0, 10).map((member) =>
    decisionOption({
      description: member.email,
      label: member.name || member.email.split("@")[0] || member.email,
      value: member.email,
    })
  );
  const initialMembers = memberOptions.filter(
    (option) => option.value === actorEmail
  );
  const candidateEmailMessage = args.candidate.email
    ? `후보자 수신 주소: ${escapeMrkdwn(args.candidate.email)}`
    : "후보자 이메일이 없어 소개 이메일을 보낼 수 없어요. 직접 연락을 선택해 주세요.";

  return {
    blocks: [
      {
        text: textObject(
          `*${escapeMrkdwn(args.candidate.name)}님과의 연결을 시작할게요.*\n${escapeMrkdwn(args.candidate.roleName)} · ${candidateEmailMessage}\n\n소개 이메일 방식은 선택한 담당자와 후보자에게 소개 이메일을 바로 보내고, 양측이 같은 이메일에서 인사와 다음 일정을 이어갈 수 있게 연결해요. 보낸 이메일은 회수할 수 없어요.\n\n직접 연락 방식은 Harper가 이메일을 보내지 않으며, 연결 후 회사가 후보자에게 직접 연락해 인사하고 다음 일정을 조율해야 해요. 원하시는 방식을 선택해 주세요.`
        ),
        type: "section",
      },
      {
        block_id: "review_accept_connection_mode",
        dispatch_action: true,
        element: {
          action_id: HARPER_TALENT_REVIEW_CONNECTION_MODE_ACTION_ID,
          initial_option:
            connectionOptions.find(
              (option) => option.value === connectionMode
            ) ?? connectionOptions[0],
          options: connectionOptions,
          type: "radio_buttons",
        },
        label: textObject("연결 방식", "plain_text"),
        type: "input",
      },
      ...(connectionMode === "cc_intro" && memberOptions.length > 0
        ? [
            {
              block_id: "review_accept_intro_members",
              element: {
                action_id: "intro_members",
                ...(initialMembers.length > 0
                  ? { initial_options: initialMembers }
                  : {}),
                options: memberOptions,
                type: "checkboxes",
              },
              hint: textObject(
                "소개 이메일에 함께 포함할 회사 담당자예요.",
                "plain_text"
              ),
              label: textObject("회사 수신자", "plain_text"),
              type: "input",
            },
          ]
        : []),
      {
        block_id: "review_accept_reason",
        element: {
          action_id: "accept_reason",
          max_length: 2000,
          multiline: true,
          placeholder: textObject(
            "예: 후보자의 ML infra 경험이 현재 역할과 잘 맞습니다.",
            "plain_text"
          ),
          type: "plain_text_input",
        },
        hint: textObject(
          "다음 추천에 참고하며 후보자에게 직접 공유되지 않습니다.",
          "plain_text"
        ),
        label: textObject("연결 메모", "plain_text"),
        optional: true,
        type: "input",
      },
    ],
    callback_id: HARPER_TALENT_REVIEW_ACCEPT_CALLBACK_ID,
    clear_on_close: true,
    close: textObject("취소", "plain_text"),
    private_metadata: metadata,
    submit: textObject(
      connectionMode === "cc_intro"
        ? "소개 이메일 보내기"
        : "직접 연락으로 연결하기",
      "plain_text"
    ),
    title: textObject("후보자 연결", "plain_text"),
    type: "modal",
  };
}

export function buildSlackTalentReviewRejectDecisionView(args: {
  candidate: SlackTalentReviewCandidate;
  candidateIndex: number;
  sourceMessageId: number;
}): SlackModalView {
  const reasonOptions = DEFAULT_ORG_STOP_REASONS.map((reason) =>
    decisionOption({ label: reason, value: reason })
  );
  return {
    blocks: [
      {
        text: textObject(
          `*${escapeMrkdwn(args.candidate.name)}님과의 연결을 이번에는 진행하지 않을까요?*\n연결을 거절하면 회사가 더 진행하지 않기로 했다는 종료 결정이 후보자에게 표시되고, Harper가 후보자에게 배려 있게 안내해요. 이후 이 후보자는 해당 역할의 연결 과정에서 더 이상 진행되지 않으며, 후보자에게 보이거나 전달된 안내는 회수할 수 없어요.\n\n선택하신 이유는 후보자에게 그대로 전하지 않고 다음 추천을 더 정확하게 하는 데 참고할게요.`
        ),
        type: "section",
      },
      {
        block_id: "review_reject_reasons",
        element: {
          action_id: "reject_reasons",
          options: reasonOptions,
          type: "checkboxes",
        },
        label: textObject("연결 거절 이유", "plain_text"),
        optional: true,
        type: "input",
      },
      {
        block_id: "review_reject_note",
        element: {
          action_id: "reject_note",
          max_length: 1500,
          multiline: true,
          placeholder: textObject(
            "이유를 알려주시면 다음에 더 적합한 인재를 추천하는 데 참고합니다.",
            "plain_text"
          ),
          type: "plain_text_input",
        },
        hint: textObject(
          "선택 사항이며 후보자에게 직접 전달되지 않습니다.",
          "plain_text"
        ),
        label: textObject("추가 이유", "plain_text"),
        optional: true,
        type: "input",
      },
    ],
    callback_id: HARPER_TALENT_REVIEW_REJECT_CALLBACK_ID,
    clear_on_close: true,
    close: textObject("취소", "plain_text"),
    private_metadata: encodeSlackTalentReviewViewMetadata({
      candidateIndex: args.candidateIndex,
      sourceMessageId: args.sourceMessageId,
      workspaceId: args.candidate.workspaceId,
    }),
    submit: textObject("연결 거절하기", "plain_text"),
    title: textObject("연결 거절", "plain_text"),
    type: "modal",
  };
}

export function buildSlackTalentReviewDecisionProcessingView(
  decision: "accept" | "reject"
): SlackModalView {
  return {
    blocks: [
      {
        text: textObject(
          `:hourglass_flowing_sand: *${decision === "accept" ? "후보자 연결" : "후보자 연결 거절"}을 처리하고 있어요.*\n이 창을 닫지 말고 잠시 기다려 주세요.`
        ),
        type: "section",
      },
    ],
    close: textObject("처리 중", "plain_text"),
    clear_on_close: true,
    title: textObject("결정 반영 중", "plain_text"),
    type: "modal",
  };
}

export function buildSlackTalentReviewDecisionResultView(args: {
  candidateName: string;
  connectionMode?: SlackTalentReviewConnectionMode;
  decision: "accept" | "reject";
}): SlackModalView {
  const candidateName = args.candidateName.endsWith("님")
    ? args.candidateName
    : `${args.candidateName}님`;
  const detail =
    args.decision === "reject"
      ? "Harper가 후보자에게 회사가 이번 연결을 더 진행하지 않기로 했다고 배려 있게 안내해요. 이후 이 후보자는 해당 역할의 연결 과정에서 더 이상 진행되지 않으며, 회사가 남긴 이유는 후보자에게 그대로 전달하지 않고 다음 추천 기준에 참고할게요."
      : args.connectionMode === "cc_intro"
        ? "선택한 회사 담당자와 후보자에게 소개 이메일을 보냈어요. 이제 양측이 같은 이메일에서 인사하고 다음 일정을 직접 조율할 수 있어요. 보낸 이메일은 회수할 수 없어요.\n\n서로에게 좋은 기회가 되길 바랄게요 :)"
        : "후보자를 연결됨으로 표시했어요. Harper는 소개 이메일을 보내지 않았으니 회사에서 후보자에게 직접 연락해 인사하고 다음 일정을 조율해 주세요.\n\n서로에게 좋은 기회가 되길 바랄게요 :)";
  return {
    blocks: [
      {
        text: textObject(
          `:white_check_mark: *${escapeMrkdwn(candidateName)}과 ${
            args.decision === "accept" ? "연결해드렸어요" : "연결을 거절했어요"
          }.*\n${detail}`
        ),
        type: "section",
      },
    ],
    clear_on_close: true,
    close: textObject("닫기", "plain_text"),
    title: textObject(
      args.decision === "accept" ? "연결 시작" : "연결 거절",
      "plain_text"
    ),
    type: "modal",
  };
}

export function buildSlackTalentReviewDecisionErrorView(
  message: string
): SlackModalView {
  return {
    blocks: [
      {
        text: textObject(
          `:warning: *결정을 반영하지 못했습니다.*\n${escapeMrkdwn(message)}\n\nSlack 알림에서 후보자 검토를 다시 열면 최신 상태를 확인할 수 있습니다.`
        ),
        type: "section",
      },
    ],
    clear_on_close: true,
    close: textObject("닫기", "plain_text"),
    title: textObject("결정 반영 실패", "plain_text"),
    type: "modal",
  };
}

export function buildSlackTalentReviewCandidateView(args: {
  canManageCandidates: boolean;
  candidate: SlackTalentReviewCandidate;
  candidateCount: number;
  candidateIndex: number;
  sourceMessageId: number;
}): SlackModalView {
  const { candidate } = args;
  const currentNumber = args.candidateIndex + 1;
  const profileImageUrl = webImageUrl(
    getDisplayableProfileImageUrl(candidate.profilePicture)
  );
  const profileUrl = buildAutoIntroCandidateProfileUrl({
    recommendationId: candidate.recommendationId,
    roleId: candidate.roleId,
    talentId: candidate.talentId,
    workspaceId: candidate.workspaceId,
  });
  const materials = registeredMaterials(candidate);
  const visibleExperiences = candidate.experiences.slice(0, MAX_PROFILE_ITEMS);
  const visibleEducations = candidate.educations.slice(0, MAX_PROFILE_ITEMS);
  const visibleExtras = candidate.extras.slice(0, MAX_PROFILE_ITEMS);
  const experienceBlocks = separatedBlockGroups(
    visibleExperiences,
    experienceBlockGroup
  );
  const educationBlocks = separatedBlockGroups(
    visibleEducations,
    educationBlockGroup
  );
  const extraBlocks = visibleExtras.map(extraSection);
  const hiddenItemCount =
    Math.max(0, candidate.experiences.length - visibleExperiences.length) +
    Math.max(0, candidate.educations.length - visibleEducations.length) +
    Math.max(0, candidate.extras.length - visibleExtras.length);
  const headerLines = [
    `*<${profileUrl}|${escapeMrkdwn(candidate.name)}>* to ${escapeMrkdwn(candidate.roleName)}`,
    `_${escapeMrkdwn(candidate.location)}_`,
  ].filter(Boolean);
  const blocks: Record<string, unknown>[] = [
    {
      ...(profileImageUrl
        ? {
            accessory: {
              alt_text: `${candidate.name} 프로필 사진`,
              image_url: profileImageUrl,
              type: "image",
            },
          }
        : {}),
      block_id: "review_candidate_header",
      text: textObject(headerLines.join("\n")),
      type: "section",
    },
  ];

  blocks.push(
    {
      block_id: "review_reason_heading",
      elements: [textObject("*Harper의 추천 이유*")],
      type: "context",
    },
    ...markdownContextBlocks(
      markdownToSlackMrkdwn(candidate.reason || "등록된 추천 이유가 없습니다."),
      "review_reason"
    )
  );

  blocks.push(
    args.canManageCandidates
      ? {
          block_id: "review_candidate_decisions",
          elements: [
            {
              action_id: HARPER_TALENT_REVIEW_ACCEPT_ACTION_ID,
              style: "primary",
              text: textObject("연결 수락", "plain_text"),
              type: "button",
              value: "accept",
            },
            {
              action_id: HARPER_TALENT_REVIEW_REJECT_ACTION_ID,
              style: "danger",
              text: textObject("연결 거절", "plain_text"),
              type: "button",
              value: "reject",
            },
          ],
          type: "actions",
        }
      : {
          block_id: "review_candidate_decisions_read_only",
          elements: [
            textObject(
              "후보자 정보는 볼 수 있지만 연결 여부는 결정할 수 없어요. Owner 또는 Admin에게 요청해 주세요."
            ),
          ],
          type: "context",
        }
  );

  blocks.push(
    ...spacedDivider(),
    { text: textObject("*등록 자료*"), type: "section" },
    ...markdownSections(
      materials.join("\n") || "등록된 자료가 없습니다.",
      "review_materials"
    )
  );
  if (candidate.bio) {
    blocks.push(
      { text: textObject("*소개*"), type: "section" },
      ...markdownSections(markdownToSlackMrkdwn(candidate.bio), "review_bio")
    );
  }
  if (experienceBlocks.length > 0) {
    blocks.push(
      ...spacedDivider(),
      { text: textObject("*경력*"), type: "section" },
      ...experienceBlocks
    );
  }
  if (educationBlocks.length > 0) {
    blocks.push(
      ...spacedDivider(),
      { text: textObject("*학력*"), type: "section" },
      ...educationBlocks
    );
  }
  if (extraBlocks.length > 0) {
    blocks.push(
      ...spacedDivider(),
      { text: textObject("*기타*"), type: "section" },
      ...extraBlocks
    );
  }
  if (hiddenItemCount > 0) {
    blocks.push({
      elements: [
        textObject(
          `나머지 ${hiddenItemCount}개 항목은 <${profileUrl}|Harper 전체 프로필>에서 확인할 수 있습니다.`
        ),
      ],
      type: "context",
    });
  }

  const navigationElements: Record<string, unknown>[] = [];
  if (args.candidateIndex > 0) {
    navigationElements.push({
      action_id: HARPER_TALENT_REVIEW_PREVIOUS_ACTION_ID,
      text: textObject("이전 후보자", "plain_text"),
      type: "button",
      value: "previous",
    });
  }
  if (args.candidateIndex < args.candidateCount - 1) {
    navigationElements.push({
      action_id: HARPER_TALENT_REVIEW_NEXT_ACTION_ID,
      text: textObject("다음 후보자", "plain_text"),
      type: "button",
      value: "next",
    });
  }
  blocks.push(
    ...spacedDivider(),
    {
      text: textObject(`<${profileUrl}|Harper에서 전체 프로필 열기>`),
      type: "section",
    },
    ...(navigationElements.length > 0
      ? [{ elements: navigationElements, type: "actions" }]
      : [])
  );

  return {
    blocks: blocks.slice(0, 100),
    close: textObject("닫기", "plain_text"),
    private_metadata: encodeSlackTalentReviewViewMetadata({
      candidateIndex: args.candidateIndex,
      sourceMessageId: args.sourceMessageId,
      workspaceId: candidate.workspaceId,
    }),
    title: textObject(
      `연결 검토 ${currentNumber}/${args.candidateCount}`,
      "plain_text"
    ),
    type: "modal",
  };
}
