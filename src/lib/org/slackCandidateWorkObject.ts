import type { OrgLocale } from "@/i18n/org/locale";
import {
  parseBackgroundResultParts,
  type BackgroundResultPart,
} from "./agent/backgroundResultParts";

export const SLACK_CANDIDATE_ENTITY_TYPE = "slack#/entities/item";
// Slack requires external_ref.type to be at most 20 characters.
export const SLACK_CANDIDATE_REF_TYPE = "company_intro";
export const SLACK_CANDIDATE_INTRO_ACTION = "harper_candidate_request_intro";
export const SLACK_CANDIDATE_PASS_ACTION = "harper_candidate_pass";
export const SLACK_CANDIDATE_DECISION_CALLBACK =
  "harper_candidate_intro_decision";

export type SlackCandidateCard = {
  id: string;
  name: string;
  headline?: string | null;
  latestExperience?: {
    role: string | null;
    companyName: string | null;
  } | null;
  profileUrl: string;
  linkedUrls?: string[];
  roleName: string;
  status: string;
  candidateSentAt?: string | null;
  acceptedConnection?: boolean;
};

export type SlackCandidateDocumentLink = { label: string; url: string };

function candidateDocumentMarkdown(link: SlackCandidateDocumentLink) {
  try {
    const url = new URL(link.url);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return "";
    const label = link.label.replace(/[\\[\]_*`]/g, "\\$&");
    const href = url.href.replace(
      /[()<>\\[\]]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return `[${label}](${href})`;
  } catch {
    return "";
  }
}

/** Consume Worker-authored Block Kit identities; never infer a candidate from prose. */
export function slackCandidatePartsFromBlocks(
  blocks: unknown,
  candidates: SlackCandidateCard[]
): BackgroundResultPart[] | undefined {
  if (
    !Array.isArray(blocks) ||
    !blocks.some(
      (block) =>
        typeof block?.block_id === "string" &&
        block.block_id.startsWith("company_intro_")
    )
  )
    return undefined;
  const parts = blocks.map((block) => {
    if (block?.type !== "section" || typeof block?.text?.text !== "string")
      throw new Error("Invalid candidate result rendering block");
    return {
      text: block.text.text,
      candidateId:
        typeof block.block_id === "string" &&
        block.block_id.startsWith("company_intro_")
          ? block.block_id.slice("company_intro_".length)
          : null,
    };
  });
  return parseBackgroundResultParts(
    { parts },
    candidates.map((candidate) => candidate.id)
  );
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function candidateEntityId(value: unknown) {
  return typeof value === "string" && uuid.test(value) ? value : null;
}

export function candidateStatusLabel(
  candidate: Pick<SlackCandidateCard, "status" | "candidateSentAt">,
  locale: OrgLocale
) {
  const labels: Record<string, [string, string]> = {
    ready: ["검토 대기", "Ready for review"],
    awaiting_talent: candidate.candidateSentAt
      ? ["후보자 답변 대기", "Awaiting candidate reply"]
      : ["제안 준비 중", "Preparing intro request"],
    connecting: [
      "후보자 수락 · 연결 준비 중",
      "Candidate accepted · connecting",
    ],
    pending_connection: ["수락시 바로 연결", "Accept to connect"],
    connected: ["연결됨", "Connected"],
    already_in_pipeline: [
      "이미 채용 검토 중",
      "Already in the hiring pipeline",
    ],
    passed: ["Pass", "Passed"],
    closed: ["요청 종료", "Request closed"],
  };
  const pair = labels[candidate.status] ?? [
    "현재 진행할 수 없음",
    "Currently unavailable",
  ];
  return pair[locale === "ko" ? 0 : 1];
}

export function buildSlackCandidateEntity(args: {
  candidate: SlackCandidateCard;
  locale: OrgLocale;
  canDecide?: boolean;
  canRequestIntro?: boolean;
  canPass?: boolean;
  surface?: "card" | "details";
  documents?: SlackCandidateDocumentLink[];
  details?: Array<{
    key: string;
    label: string;
    value: string;
    markdown?: boolean;
    long?: boolean;
    icon?: { url: string; alt_text: string };
  }>;
}) {
  const { candidate, locale } = args;
  const customFields =
    args.surface === "details"
      ? [
          {
            key: "documents",
            label: "Documents",
            value: [
              ...(args.documents ?? []),
              { label: "자세히 보기", url: candidate.profileUrl },
            ]
              .map(candidateDocumentMarkdown)
              .filter(Boolean)
              .join(" · "),
            type: "string",
            format: "markdown",
          },
          ...(candidate.headline
            ? [
                {
                  key: "headline",
                  label: locale === "ko" ? "헤드라인" : "Headline",
                  value: candidate.headline,
                  type: "string",
                },
              ]
            : []),
          ...(args.details ?? [])
            .filter((field) => field.value)
            .map((field) => ({
              key: field.key,
              label: field.label,
              value: field.value,
              type: "string",
              ...(field.markdown ? { format: "markdown" } : {}),
              ...(field.long ? { long: true } : {}),
              ...(field.icon && !field.markdown ? { icon: field.icon } : {}),
            })),
        ]
      : [];
  const role = candidate.latestExperience?.role?.trim();
  const company = candidate.latestExperience?.companyName?.trim();
  // Slack owns the separator: `${display_type} in ${product_name}`.
  const hasLatestExperience = Boolean(role && company);
  return {
    entity_type: SLACK_CANDIDATE_ENTITY_TYPE,
    external_ref: { id: candidate.id, type: SLACK_CANDIDATE_REF_TYPE },
    url: candidate.profileUrl,
    entity_payload: {
      attributes: {
        title: { text: candidate.name },
        display_type:
          args.surface === "details"
            ? locale === "ko"
              ? "후보자"
              : "Candidate"
            : hasLatestExperience
              ? role
              : "Candidates",
        product_name:
          candidate.acceptedConnection || args.surface === "details" || !hasLatestExperience
            ? "Harper"
            : company,
        ...(args.surface !== "details"
          ? {
              product_icon: {
                url: "https://matchharper.com/images/squareface.png",
                alt_text: "Harper",
              },
            }
          : {}),
        ...(candidate.acceptedConnection ? {
          ...(candidate.status === "pending_connection" ? { display_id: locale === "ko" ? "🟠 수락시 바로 연결" : "🟠 Accept to connect" } : {}),
          product_icon: { url: "https://matchharper.com/images/squareface_orange.png", alt_text: "Harper" },
        } : {}),
      },
      custom_fields: customFields,
      display_order: customFields.map((field) => field.key),
      ...(args.surface === "details" &&
      candidate.status === "ready" &&
      args.canDecide !== false &&
      (args.canRequestIntro !== false || args.canPass !== false)
        ? {
            actions: {
              primary_actions: [
                ...(args.canRequestIntro !== false
                  ? [
                      {
                        action_id: SLACK_CANDIDATE_INTRO_ACTION,
                        text: locale === "ko" ? "Intro 요청" : "Request Intro",
                        style: "primary",
                        value: candidate.id,
                      },
                    ]
                  : []),
                ...(args.canPass !== false
                  ? [
                      {
                        action_id: SLACK_CANDIDATE_PASS_ACTION,
                        text: "Pass",
                        value: candidate.id,
                      },
                    ]
                  : []),
              ],
            },
          }
        : {}),
    },
  };
}

/** Split only on paragraph boundaries carrying verified candidate links. This
 * transports the company-side LLM's prose unchanged; it never judges its content. */
export function buildSlackCandidateResultPosts(
  text: string,
  candidates: SlackCandidateCard[],
  parts?: BackgroundResultPart[]
) {
  if (parts) {
    const verified = parseBackgroundResultParts(
      { parts },
      candidates.map((candidate) => candidate.id)
    );
    const byId = new Map(
      candidates.map((candidate) => [candidate.id, candidate])
    );
    return verified.map((part, index) => ({
      key: part.candidateId ?? `result:${index}`,
      text: part.text,
      candidates: part.candidateId
        ? [byId.get(part.candidateId)!]
        : ([] as SlackCandidateCard[]),
    }));
  }
  if (!candidates.length)
    return [{ key: "result", text, candidates: [] as SlackCandidateCard[] }];
  const linked = candidates
    .map((candidate) => {
      const positions = [candidate.profileUrl, ...(candidate.linkedUrls ?? [])]
        .map((url) => text.indexOf(`<${url}|`))
        .filter((position) => position >= 0);
      const position = positions.length ? Math.min(...positions) : -1;
      const boundary = position < 0 ? -1 : text.lastIndexOf("\n\n", position);
      return { candidate, position, start: boundary < 0 ? 0 : boundary + 2 };
    })
    .sort((a, b) => a.position - b.position);
  if (
    linked.some((item) => item.position < 0) ||
    new Set(linked.map((item) => item.start)).size !== linked.length
  ) {
    // When the writer uses another layout, preserve the complete answer and
    // provide each card independently rather than guessing description boundaries.
    return [
      { key: "result", text, candidates: [] as SlackCandidateCard[] },
      ...candidates.map((candidate) => ({
        key: candidate.id,
        text: `<${candidate.profileUrl}|${candidate.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;")}>`,
        candidates: [candidate],
      })),
    ];
  }
  return linked.map((item, index) => ({
    key: item.candidate.id,
    text: text.slice(
      index === 0 ? 0 : item.start,
      linked[index + 1]?.start ?? text.length
    ),
    candidates: [item.candidate],
  }));
}

export type SlackCandidateDecisionMetadata = {
  candidateId: string;
  decision: "request_intro" | "pass";
  locale: OrgLocale;
};
export function parseCandidateDecisionMetadata(
  value: unknown
): SlackCandidateDecisionMetadata | null {
  try {
    const data = JSON.parse(String(value ?? ""));
    if (
      !candidateEntityId(data.candidateId) ||
      !["request_intro", "pass"].includes(data.decision) ||
      !["ko", "en"].includes(data.locale)
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

const plain = (text: string) => ({ type: "plain_text", text });
export function buildSlackCandidateDecisionView(args: {
  metadata: SlackCandidateDecisionMetadata;
  candidate: SlackCandidateCard;
  members: Array<{ email: string | null; name: string | null }>;
  actorEmail: string;
  appeal?: string;
  recipientEmails?: string[];
  error?: string;
  errorBlocks?: Array<Record<string, unknown>>;
}) {
  const ko = args.metadata.locale === "ko";
  const request = args.metadata.decision === "request_intro";
  const options = args.members
    .filter((member) => member.email)
    .toSorted(
      (left, right) =>
        Number(right.email === args.actorEmail) -
        Number(left.email === args.actorEmail)
    )
    .filter(
      (member, index, members) =>
        members.findIndex((item) => item.email === member.email) === index
    )
    .map((member) => ({
      text: plain(
        `${member.name || member.email} (${member.email})`.slice(0, 75)
      ),
      value: member.email!,
    }))
    .slice(0, 100);
  const initial = options.filter((option) =>
    (args.recipientEmails ?? [args.actorEmail]).includes(option.value)
  );
  return {
    type: "modal",
    callback_id: SLACK_CANDIDATE_DECISION_CALLBACK,
    private_metadata: JSON.stringify(args.metadata),
    title: plain(request ? (ko ? "Intro 요청" : "Request Intro") : "Pass"),
    close: plain(ko ? "취소" : "Cancel"),
    submit: plain(request ? (ko ? "Intro 요청" : "Request Intro") : "Pass"),
    blocks: [
      {
        type: "section",
        text: plain(
          `${args.candidate.name} · ${args.candidate.roleName}\n\n${
            request
              ? ko
                ? "Harper가 회사의 관심을 담아 후보자에게 제안해요. 후보자가 수락하면 선택한 팀원과 소개 이메일로 바로 연결해요."
                : "Harper will send your interest to the candidate. If they accept, Harper will connect them with the selected teammates by email."
              : ko
                ? "이번 역할로 제안하지 않고 목록에서 제외해요. 후보자에게 연락하거나 알림을 보내지 않아요."
                : "Remove this suggestion for this role. No message or notification will be sent to the candidate."
          }`
        ),
      },
      ...(args.error ? [{ type: "section", text: plain(args.error) }] : []),
      ...(args.errorBlocks ?? []),
      ...(request
        ? [
            {
              type: "input",
              block_id: "candidate_appeal",
              label: plain(
                ko
                  ? "후보자에게 전달하고 싶은 내용"
                  : "What you want to tell the candidate"
              ),
              element: {
                type: "plain_text_input",
                action_id: "appeal",
                multiline: true,
                max_length: 2000,
                ...(args.appeal ? { initial_value: args.appeal } : {}),
              },
            },
            {
              type: "input",
              block_id: "candidate_recipients",
              label: plain(
                ko
                  ? "수락 시 소개 이메일을 받을 팀원"
                  : "Teammates to include in the intro email"
              ),
              element: {
                type: "multi_static_select",
                action_id: "recipients",
                options,
                ...(initial.length ? { initial_options: initial } : {}),
              },
            },
          ]
        : []),
    ],
  };
}

export function parseCandidateDecisionInputs(
  metadata: SlackCandidateDecisionMetadata,
  state: any
) {
  const appeal = String(
    state?.values?.candidate_appeal?.appeal?.value ?? ""
  ).trim();
  const selections =
    state?.values?.candidate_recipients?.recipients?.selected_options;
  const recipientEmails: string[] = Array.isArray(selections)
    ? selections.flatMap((option: any) =>
        typeof option.value === "string" ? [option.value] : []
      )
    : [];
  const errors: Record<string, string> = {};
  if (metadata.decision === "request_intro") {
    if (!appeal || appeal.length > 2000)
      errors.candidate_appeal =
        metadata.locale === "ko"
          ? "후보자에게 전달하고 싶은 내용을 입력해 주세요."
          : "Enter what you want to tell the candidate.";
    if (!recipientEmails.length)
      errors.candidate_recipients =
        metadata.locale === "ko"
          ? "소개 이메일을 받을 팀원을 선택해 주세요."
          : "Select a teammate to receive the intro email.";
  }
  return { appeal, recipientEmails, errors };
}
