export const OPS_NETWORK_MAIL_TEMPLATE_VARIABLES = [
  {
    key: "name",
    label: "{{name}}",
    description: "후보자 이름",
  },
  {
    key: "mail",
    label: "{{mail}}",
    description: "후보자 이메일",
  },
  {
    key: "invite_url",
    label: "{{invite_url}}",
    description: "후보자 전용 Harper 링크",
  },
] as const;

export type OpsNetworkMailTemplateVariableKey =
  (typeof OPS_NETWORK_MAIL_TEMPLATE_VARIABLES)[number]["key"];

function normalizeTemplateValue(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function deriveNameFromMail(mail: string) {
  return mail.split("@")[0]?.trim() ?? "";
}

export function buildOpsNetworkMailTemplateVariables(args: {
  inviteUrl?: string | null;
  mail?: string | null;
  name?: string | null;
}) {
  const invite_url = normalizeTemplateValue(args.inviteUrl);
  const mail = normalizeTemplateValue(args.mail);
  const name = normalizeTemplateValue(args.name) || deriveNameFromMail(mail);

  return {
    invite_url,
    mail,
    name,
  } satisfies Record<OpsNetworkMailTemplateVariableKey, string>;
}

export function renderOpsNetworkMailTemplate(
  template: string,
  args: {
    inviteUrl?: string | null;
    mail?: string | null;
    name?: string | null;
  }
) {
  const variables = buildOpsNetworkMailTemplateVariables(args);

  return String(template ?? "").replace(
    /\{\{\s*(invite_url|mail|name)\s*\}\}/g,
    (_, key: OpsNetworkMailTemplateVariableKey) => variables[key] ?? ""
  );
}
