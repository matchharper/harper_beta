import type {
  RequestAccessApprovalEmailLocale,
  RequestAccessApprovalEmailTemplate,
} from "@/lib/requestAccess/types";

export type RequestAccessApprovalTemplateVariableKey =
  | "activationUrl"
  | "company"
  | "email"
  | "hiringNeed"
  | "name"
  | "role";

export type RequestAccessApprovalTemplateVariables = Partial<
  Record<RequestAccessApprovalTemplateVariableKey, string | null | undefined>
>;

export const REQUEST_ACCESS_APPROVAL_TEMPLATE_VARIABLES: Array<{
  key: RequestAccessApprovalTemplateVariableKey;
  label: string;
  placeholder: `{{${RequestAccessApprovalTemplateVariableKey}}}`;
}> = [
  { key: "name", label: "이름", placeholder: "{{name}}" },
  { key: "email", label: "이메일", placeholder: "{{email}}" },
  { key: "company", label: "회사", placeholder: "{{company}}" },
  { key: "role", label: "역할", placeholder: "{{role}}" },
  { key: "hiringNeed", label: "채용 니즈", placeholder: "{{hiringNeed}}" },
  {
    key: "activationUrl",
    label: "활성화 링크",
    placeholder: "{{activationUrl}}",
  },
];

function normalizeText(value?: string | null) {
  return String(value ?? "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderRequestAccessApprovalTemplate(
  template: string,
  variables: RequestAccessApprovalTemplateVariables
) {
  const normalizedVariables = Object.fromEntries(
    REQUEST_ACCESS_APPROVAL_TEMPLATE_VARIABLES.map(({ key }) => [
      key,
      normalizeText(variables[key]),
    ])
  ) as Record<RequestAccessApprovalTemplateVariableKey, string>;

  return String(template ?? "").replace(
    /\{\{\s*(activationUrl|company|email|hiringNeed|name|role)\s*\}\}/g,
    (_, key: RequestAccessApprovalTemplateVariableKey) =>
      normalizedVariables[key] ?? ""
  );
}

export function buildRequestAccessApprovedEmailTemplate(args: {
  locale: RequestAccessApprovalEmailLocale;
  name?: string | null;
  activationUrl: string;
}): RequestAccessApprovalEmailTemplate {
  const recipientName =
    normalizeText(args.name) || (args.locale === "ko" ? "고객" : "there");
  const safeRecipientName = escapeHtml(recipientName);
  const safeActivationUrl = escapeHtml(args.activationUrl);
  const copy =
    args.locale === "ko"
      ? {
          subject: "Harper 이용이 준비되었습니다",
          greeting: `${safeRecipientName}님, 안녕하세요.`,
          welcome: "Harper에 오신 것을 환영합니다.",
          approved: "요청하신 Harper access가 승인되었습니다.",
          intro:
            "아래 링크를 눌러 접근을 활성화하고 바로 Harper를 사용해보세요.",
          cta: "Harper 시작하기",
          fallback:
            "혹시 링크가 열리지 않는다면 아래 URL을 브라우저에 붙여넣어 주세요.",
          footer:
            "Harper는 진짜 인재를 발견하도록 도와주는 AI Recruiting Agent입니다.",
          text: [
            `${recipientName}님, 안녕하세요.`,
            "",
            "Harper에 오신 것을 환영합니다.",
            "Harper request access가 승인되었습니다.",
            "아래 링크를 열어 접근을 활성화해 주세요:",
            args.activationUrl,
          ].join("\n"),
        }
      : {
          subject: "Your Harper access is ready",
          greeting: `Hi ${safeRecipientName},`,
          welcome: "Welcome to Harper!",
          approved: "Your Harper request access has been approved.",
          intro:
            "Click the link below to activate your access and go straight into Harper.",
          cta: "Activate Harper Access",
          fallback:
            "If the link does not open, paste this URL into your browser:",
          footer:
            "Harper helps you discover real engineers and researchers through their actual work.",
          text: [
            `Hi ${recipientName},`,
            "",
            "Welcome to Harper!",
            "Your Harper request access has been approved.",
            "Open the link below to activate your access:",
            args.activationUrl,
          ].join("\n"),
        };
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <p>${copy.greeting}</p>
      <p>${escapeHtml(copy.welcome)}</p>
      <p>${escapeHtml(copy.approved)}</p>
      <p>${escapeHtml(copy.intro)}</p>
      <p><a href="${safeActivationUrl}">${escapeHtml(copy.cta)}</a></p>
      <p>${escapeHtml(copy.fallback)}</p>
      <p>${safeActivationUrl}</p>
      <p></p>
      <div style="margin-top: 32px; padding-left: 12px; border-left: 3px solid #EFFF3F;">
        <p style="margin: 0; font-size: 13px; color: #111827;">
          ${escapeHtml(copy.footer)}
        </p>
      </div>
    </div>
  `;

  return {
    subject: copy.subject,
    html,
    text: copy.text,
  };
}

export function buildRequestAccessApprovedEmailTemplates(args: {
  name?: string | null;
  activationUrl: string;
}) {
  return {
    en: buildRequestAccessApprovedEmailTemplate({
      locale: "en",
      name: args.name,
      activationUrl: args.activationUrl,
    }),
    ko: buildRequestAccessApprovedEmailTemplate({
      locale: "ko",
      name: args.name,
      activationUrl: args.activationUrl,
    }),
  } satisfies Record<
    RequestAccessApprovalEmailLocale,
    RequestAccessApprovalEmailTemplate
  >;
}

export function buildBulkRequestAccessApprovedEmailTemplates() {
  return buildRequestAccessApprovedEmailTemplates({
    name: "{{name}}",
    activationUrl: "{{activationUrl}}",
  });
}
