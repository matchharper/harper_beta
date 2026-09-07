import {
  COMPOSIO_GMAIL_TOOL_VERSION,
  ComposioApiError,
  createComposioClient,
  executeComposioGmailFetchEmails,
  getComposioAccountStatus,
  getComposioConnectedAccount,
  isOwnedComposioGmailAccount,
} from "../src/lib/integrations/composio";
import { getTalentSupabaseAdmin } from "../src/lib/talentOnboarding/admin";

type QuerySpec = {
  group: "candidate" | "current" | "custom";
  name: string;
  query: string;
};

type MessageMetadata = {
  from: string | null;
  id: string;
  receivedAt: string | null;
  subject: string | null;
  threadId: string | null;
  to: string | null;
};

type ExpansionTarget = {
  firstSeenAt: Date;
  kind: "address" | "domain";
  lastSeenAt: Date;
  value: string;
};

const DENOISE_QUERY =
  "-category:promotions -category:social -in:spam -in:trash";

const EXPANSION_SEED_QUERIES = new Set([
  "candidate-application-events",
  "candidate-interview-events",
  "candidate-assessment-events",
  "candidate-recruiting-mailboxes",
  "candidate-sent-applications",
  "candidate-sent-career-attachments",
  "candidate-platform-applications",
  "candidate-interview-calendar",
  "candidate-application-forms",
]);
const STRONG_EXPANSION_SEED_QUERIES = new Set([
  "candidate-application-events",
  "candidate-interview-events",
  "candidate-recruiting-mailboxes",
  "candidate-sent-applications",
  "candidate-sent-career-attachments",
  "candidate-platform-applications",
  "candidate-interview-calendar",
  "candidate-application-forms",
]);

// These domains are shared infrastructure, public mailboxes, or job-discovery
// products. Expanding an entire one cannot identify a single employer. Public
// mailbox senders are instead expanded by their exact address.
const PUBLIC_MAIL_DOMAINS = new Set([
  "daum.net",
  "gmail.com",
  "googlemail.com",
  "hanmail.net",
  "hotmail.com",
  "icloud.com",
  "naver.com",
  "outlook.com",
  "proton.me",
  "yahoo.com",
]);
const SHARED_SENDER_DOMAINS = new Set([
  "adobesign.com",
  "app.ashbyhq.com",
  "ashbyhq.com",
  "bamboohr.com",
  "dover.com",
  "eightfold.ai",
  "gem.com",
  "glassdoor.com",
  "google.com",
  "greenhouse.io",
  "greetinghr.com",
  "hire.lever.co",
  "icims.com",
  "indeed.com",
  "jobkorea.co.kr",
  "jobvite.com",
  "jumpit.co.kr",
  "lever.co",
  "linkedin.com",
  "matchharper.com",
  "myworkdayjobs.com",
  "ninehire.com",
  "paraform.com",
  "personio.com",
  "programmers.co.kr",
  "recruitee.com",
  "remember.co.kr",
  "rippling.com",
  "saramin.co.kr",
  "smartrecruiters.com",
  "successfactors.com",
  "teamtailor.com",
  "wellfound.com",
  "workablemail.com",
]);

const CURRENT_QUERIES: QuerySpec[] = [
  {
    group: "current",
    name: "current-en-subject",
    query: `in:anywhere newer_than:3y subject:(application OR applied OR interview OR recruiter OR "phone screen" OR assessment OR offer OR rejection OR "next steps" OR "thank you for applying") ${DENOISE_QUERY}`,
  },
  {
    group: "current",
    name: "current-ko-subject",
    query: `in:anywhere newer_than:3y subject:(지원 OR 서류 OR 면접 OR 코딩테스트 OR 코테 OR 과제 OR 합격 OR 불합격 OR 최종 OR 채용 OR 결과) ${DENOISE_QUERY}`,
  },
  {
    group: "current",
    name: "current-recruiting-senders",
    query: `in:anywhere newer_than:3y from:(recruiter OR recruiting OR recruitment OR careers OR career OR hiring OR hire OR hr OR talent OR "talent-team" OR "talent acquisition" OR people OR peopleops OR "people-team" OR "people team" OR "people ops" OR jobs OR staffing OR "human resources") ${DENOISE_QUERY}`,
  },
  {
    group: "current",
    name: "current-global-ats",
    query: `in:anywhere newer_than:3y from:(@greenhouse.io OR @hire.lever.co OR @myworkdayjobs.com OR @app.ashbyhq.com OR @icims.com OR jobs-noreply@linkedin.com OR donotreply@indeed.com OR @wellfound.com) ${DENOISE_QUERY}`,
  },
  {
    group: "current",
    name: "current-ko-platforms",
    query: `in:anywhere newer_than:3y from:(@wanted.co.kr OR @saramin.co.kr OR @saraminhr.co.kr OR @jobkorea.co.kr OR @programmers.co.kr OR @grepp.co OR @rocketpunch.com OR @jumpit.co.kr OR @remember.co.kr OR @zighang.com) ${DENOISE_QUERY}`,
  },
];

// Gmail documents braces as OR grouping. These probes deliberately separate
// event-language recall from known recruiting-platform recall so their value
// can be compared independently before changing production search behavior.
const CANDIDATE_QUERIES: QuerySpec[] = [
  {
    group: "candidate",
    name: "candidate-lifecycle-subjects",
    query: `newer_than:2y -in:sent {subject:"thank you for your application" subject:"thank you for applying" subject:"thanks for applying" subject:"thank you for your interest" subject:"we received your application" subject:"application has been received" subject:"application was received" subject:"application received" subject:"application submitted" subject:"update on your application" subject:"application status" subject:"phone screen" subject:"recruiter screen" subject:"technical interview" subject:"interview schedule" subject:"interview invitation" subject:"interview confirmation" subject:"next steps" subject:"screening result" subject:"interview result" subject:"assessment result" subject:"coding challenge" subject:"online assessment" subject:"take-home" subject:"offer letter" subject:NDA subject:"non-disclosure agreement" subject:"지원해주셔서 감사합니다" subject:"지원이 정상적으로 완료" subject:"지원서가 정상적으로 접수" subject:"지원서가 잘 도착" subject:"입사지원서 접수" subject:"입사지원 확인" subject:"지원서 접수" subject:"접수 안내" subject:"서류전형" subject:"서류 전형" subject:"서류 합격" subject:"코딩테스트" subject:"코딩 테스트" subject:"과제 전형" subject:직무과제 subject:보안서약서 subject:"면접 안내" subject:"면접 일정" subject:"면접 결과" subject:"인터뷰 안내" subject:"인터뷰 일정" subject:"인터뷰 결과" subject:"전형 결과" subject:"채용 결과" subject:"최종 결과" subject:"입사 제안" subject:"처우 협의"} ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-application-events",
    query: `newer_than:2y -in:sent {subject:application subject:지원 subject:입사지원} {subject:received subject:submitted subject:complete subject:confirmation subject:update subject:status subject:requirements subject:reminder subject:waiting subject:접수 subject:확인 subject:완료 subject:도착 subject:등록} ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-interview-events",
    query: `newer_than:2y -in:sent {subject:interview subject:면접 subject:인터뷰} {subject:invitation subject:confirmation subject:schedule subject:일정 subject:안내 subject:결과 subject:합격 subject:초대} ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-assessment-events",
    query: `newer_than:2y -in:sent {subject:assessment subject:challenge subject:"coding test" subject:코딩테스트 subject:"코딩 테스트" subject:과제 subject:서류} {subject:invitation subject:안내 subject:result subject:결과 subject:합격 subject:불합격 subject:통과 subject:완료 subject:제출} ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-recruiting-mailboxes",
    query: `newer_than:2y -in:sent {from:recruit@ from:recruiting@ from:recruitment@ from:careers@ from:hiring@ from:talent@ from:talent-acquisition@ from:jobs@ from:people@ from:peopleops@ from:hr@} -from:linkedin.com -from:glassdoor.com -from:indeed.com -from:ziprecruiter.com -from:matchharper.com ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-ats-senders",
    query: `newer_than:2y -in:sent {from:greenhouse.io from:lever.co from:myworkdayjobs.com from:ashbyhq.com from:icims.com from:smartrecruiters.com from:jobvite.com from:workablemail.com from:teamtailor.com from:recruitee.com from:bamboohr.com from:eightfold.ai from:dover.com from:gem.com from:rippling.com from:personio.com from:successfactors.com from:oraclecloud.com from:phenompeople.com from:applytojob.com from:breezy-mail.com from:jazz.co from:pinpointhq.com from:jobsoid.com from:trakstar.com from:greetinghr.com from:ninehire.com from:flex.team from:wanted.co.kr from:saramin.co.kr from:jobkorea.co.kr from:programmers.co.kr from:grepp.co from:jumpit.co.kr from:remember.co.kr} ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-sent-applications",
    query:
      'newer_than:2y in:sent {subject:"application for" subject:"job application" subject:resume subject:"cover letter" subject:지원 subject:이력서 subject:포트폴리오 subject:"과제 제출"} -in:spam -in:trash',
  },
  {
    group: "candidate",
    name: "candidate-sent-career-attachments",
    query:
      "newer_than:2y in:sent has:attachment {filename:resume filename:cv filename:이력서 filename:portfolio filename:포트폴리오 filename:coverletter} -in:spam -in:trash",
  },
  {
    group: "candidate",
    name: "candidate-platform-applications",
    query:
      'newer_than:2y -in:sent {from:linkedin.com from:indeed.com from:wellfound.com} {subject:"application submitted" subject:"application sent" subject:"your application" subject:"application status" subject:"application was viewed" subject:"other applicants" subject:"people who applied" subject:"applied to" subject:"지원 완료" subject:"지원이 전송" subject:"지원 상태" subject:"지원한 다른" subject:"지원서를 확인" subject:"지원서가 조회"} -from:jobs-noreply@linkedin.com -from:jobalerts-noreply@linkedin.com -in:spam -in:trash',
  },
  {
    group: "candidate",
    name: "candidate-terminal-subjects",
    query: `newer_than:2y -in:sent {subject:"offer letter" subject:"employment offer" subject:"application update" subject:"application status" subject:"not moving forward" subject:"no longer under consideration" subject:"position filled" subject:"position closed" subject:withdrawn subject:withdrawal subject:"전형 결과" subject:"채용 결과" subject:"최종 결과" subject:불합격 subject:"최종 합격" subject:"입사 제안" subject:"처우 협의" subject:"채용 취소" subject:"지원 철회" subject:"지원 취소"} ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-interview-calendar",
    query: `newer_than:2y -in:sent {subject:interview subject:면접 subject:인터뷰} {filename:ics from:calendar-notification@google.com} ${DENOISE_QUERY}`,
  },
  {
    group: "candidate",
    name: "candidate-application-forms",
    query:
      "newer_than:2y -in:sent from:forms-receipts-noreply@google.com {subject:application subject:지원 subject:채용 subject:recruit subject:입사} -in:spam -in:trash",
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanMessageText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  return cleanText(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/https?:\/\/[^\s<>'\"]+/gi, "[link]")
      .replace(/&nbsp;|&#160;|&zwnj;|&[a-z]+;/gi, " ")
      .replace(/&#(?:x[0-9a-f]+|[0-9]+);/gi, " "),
    maxLength
  );
}

function readFlag(name: string) {
  return process.argv.includes(name);
}

function readOption(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readOptions(name: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  }
  return values;
}

function maskEmail(value: string) {
  return value.replace(/^(.{1,2}).*(@.*)$/, "$1***$2");
}

function normalizeMessage(value: unknown): MessageMetadata | null {
  const message = asRecord(value);
  if (!message) return null;
  const id = cleanText(message.messageId ?? message.id, 300);
  if (!id) return null;
  return {
    from: cleanText(message.sender ?? message.from, 500),
    id,
    receivedAt: cleanText(
      message.messageTimestamp ?? message.internalDate ?? message.date,
      120
    ),
    subject: cleanText(message.subject, 500),
    threadId: cleanText(message.threadId ?? message.thread_id, 300),
    to: cleanText(message.to, 1_000),
  };
}

function extractEmailAddresses(value: string | null) {
  if (!value) return [];
  return [
    ...new Set(
      value
        .toLowerCase()
        .match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []
    ),
  ];
}

function gmailDate(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("/");
}

function shiftedDate(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1_000);
}

function isSharedSenderDomain(domain: string) {
  return [...SHARED_SENDER_DOMAINS].some(
    (shared) => domain === shared || domain.endsWith(`.${shared}`)
  );
}

async function withTransientRetry<T>(work: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof ComposioApiError) ||
        ![429, 502, 503, 504].includes(error.status) ||
        attempt === 1
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  throw lastError;
}

function safeFailure(error: unknown) {
  return error instanceof ComposioApiError
    ? { name: error.name, status: error.status }
    : { name: error instanceof Error ? error.name : "UnknownError" };
}

function deriveExpansionTargets(args: {
  candidateIds: Set<string>;
  mailboxEmail: string;
  memberships: Map<string, Set<string>>;
  messagesById: Map<string, MessageMetadata>;
}) {
  const byKey = new Map<
    string,
    ExpansionTarget & { messageIds: Set<string>; strong: boolean }
  >();
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);

  for (const id of args.candidateIds) {
    const message = args.messagesById.get(id);
    const matchedBy = args.memberships.get(id) ?? new Set<string>();
    if (
      !message ||
      ![...matchedBy].some((name) => EXPANSION_SEED_QUERIES.has(name))
    ) {
      continue;
    }
    const occurredAt = new Date(message.receivedAt ?? "");
    if (Number.isNaN(occurredAt.getTime())) continue;
    const useRecipients = matchedBy.has("candidate-sent-applications");
    const strong = [...matchedBy].some((name) =>
      STRONG_EXPANSION_SEED_QUERIES.has(name)
    );
    const addresses = extractEmailAddresses(
      useRecipients ? message.to : message.from
    );

    for (const address of addresses) {
      if (address === args.mailboxEmail) continue;
      const domain = address.split("@")[1];
      if (!domain || isSharedSenderDomain(domain)) continue;
      const kind = PUBLIC_MAIL_DOMAINS.has(domain) ? "address" : "domain";
      const value = kind === "address" ? address : domain;
      const key = `${kind}:${value}`;
      const existing = byKey.get(key);
      byKey.set(key, {
        firstSeenAt:
          !existing || occurredAt < existing.firstSeenAt
            ? occurredAt
            : existing.firstSeenAt,
        kind,
        lastSeenAt:
          !existing || occurredAt > existing.lastSeenAt
            ? occurredAt
            : existing.lastSeenAt,
        value,
        messageIds: new Set([...(existing?.messageIds ?? []), id]),
        strong: strong || existing?.strong === true,
      });
    }
  }

  const upperBound = shiftedDate(new Date(), 1);
  return [...byKey.values()]
    .filter((target) => target.strong || target.messageIds.size >= 2)
    .map((target) => ({
      kind: target.kind,
      firstSeenAt:
        shiftedDate(target.firstSeenAt, -90) < cutoff
          ? cutoff
          : shiftedDate(target.firstSeenAt, -90),
      lastSeenAt:
        shiftedDate(target.lastSeenAt, 180) > upperBound
          ? upperBound
          : shiftedDate(target.lastSeenAt, 180),
      value: target.value,
    }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

function summarizeShape(value: unknown, depth = 0): unknown {
  if (depth >= 4) return typeof value;
  if (Array.isArray(value)) {
    return {
      length: value.length,
      first: value.length ? summarizeShape(value[0], depth + 1) : null,
    };
  }
  const record = asRecord(value);
  if (!record) return typeof value;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      /body|content|data|payload|snippet/i.test(key)
        ? Array.isArray(child)
          ? { length: child.length }
          : typeof child
        : summarizeShape(child, depth + 1),
    ])
  );
}

function parseCustomQuery(value: string, index: number): QuerySpec {
  const separator = value.indexOf("=");
  if (separator <= 0) {
    return { group: "custom", name: `custom-${index + 1}`, query: value };
  }
  return {
    group: "custom",
    name: value.slice(0, separator),
    query: value.slice(separator + 1),
  };
}

async function resolveTalent(email: string) {
  const admin = getTalentSupabaseAdmin();
  const { data: integrations, error } = await admin
    .from("talent_integrations")
    .select("talent_id,composio_connected_account_id,status")
    .eq("provider", "gmail")
    .eq("status", "active");
  if (error) throw error;

  for (const integration of integrations ?? []) {
    const { data, error: userError } = await admin.auth.admin.getUserById(
      integration.talent_id
    );
    if (userError) throw userError;
    if (data.user?.email?.trim().toLowerCase() === email) {
      return {
        connectedAccountId: integration.composio_connected_account_id,
        talentId: integration.talent_id,
      };
    }
  }
  throw new Error("No active Gmail integration was found for that email");
}

async function main() {
  const email = readOption("--email")?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "Usage: probeComposioGmailCareerQueries.ts --email user@example.com [--preset current|candidate|compare] [--query name=query] [--max-results 500] [--max-pages 10] [--show-metadata] [--metadata-set custom-only]"
    );
  }

  const preset = readOption("--preset") ?? "compare";
  const maxResults = Math.min(
    500,
    Math.max(
      1,
      Number.parseInt(readOption("--max-results") ?? "500", 10) || 500
    )
  );
  const maxPages = Math.min(
    100,
    Math.max(1, Number.parseInt(readOption("--max-pages") ?? "10", 10) || 10)
  );
  const customQueries = readOptions("--query").map(parseCustomQuery);
  const queries = [
    ...(preset === "current" || preset === "compare" ? CURRENT_QUERIES : []),
    ...(preset === "candidate" || preset === "compare"
      ? CANDIDATE_QUERIES
      : []),
    ...customQueries,
  ];
  if (queries.length === 0) {
    throw new Error("No queries selected");
  }

  const { connectedAccountId, talentId } = await resolveTalent(email);
  const account = await getComposioConnectedAccount(connectedAccountId);
  if (!isOwnedComposioGmailAccount(account, talentId)) {
    throw new Error(
      "The connected Gmail account does not belong to this talent"
    );
  }
  if (getComposioAccountStatus(account) !== "ACTIVE") {
    throw new Error("The connected Gmail account is not active");
  }

  const memberships = new Map<string, Set<string>>();
  const messagesById = new Map<string, MessageMetadata>();
  const idsByGroup = new Map<QuerySpec["group"], Set<string>>();
  const summaries: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < queries.length; offset += 3) {
    const batch = queries.slice(offset, offset + 3);
    const results = await Promise.all(
      batch.map(async (spec) => {
        const messages: MessageMetadata[] = [];
        let estimatedMatches: number | null = null;
        let nextPageToken: string | null = null;
        let pages = 0;

        do {
          const response = await executeComposioGmailFetchEmails({
            arguments: {
              ids_only: false,
              include_payload: false,
              include_spam_trash: false,
              max_results: maxResults,
              ...(nextPageToken ? { page_token: nextPageToken } : {}),
              query: spec.query,
              user_id: "me",
              verbose: false,
            },
            connectedAccountId,
            userId: talentId,
          });
          const payload = asRecord(response.data) ?? asRecord(response) ?? {};
          if (
            estimatedMatches === null &&
            typeof payload.resultSizeEstimate === "number"
          ) {
            estimatedMatches = payload.resultSizeEstimate;
          }
          if (Array.isArray(payload.messages)) {
            messages.push(
              ...payload.messages
                .map(normalizeMessage)
                .filter(
                  (message): message is MessageMetadata => message !== null
                )
            );
          }
          nextPageToken = cleanText(payload.nextPageToken, 500);
          pages += 1;
        } while (nextPageToken && pages < maxPages);

        return {
          estimatedMatches,
          messages,
          pages,
          spec,
          truncated: Boolean(nextPageToken),
        };
      })
    );

    for (const {
      estimatedMatches,
      messages,
      pages,
      spec,
      truncated,
    } of results) {
      const groupIds = idsByGroup.get(spec.group) ?? new Set<string>();
      for (const message of messages) {
        groupIds.add(message.id);
        messagesById.set(message.id, message);
        const names = memberships.get(message.id) ?? new Set<string>();
        names.add(spec.name);
        memberships.set(message.id, names);
      }
      idsByGroup.set(spec.group, groupIds);
      summaries.push({
        estimatedMatches,
        fetched: messages.length,
        group: spec.group,
        name: spec.name,
        pages,
        query: spec.query,
        truncated,
      });
    }
  }

  const currentIds = idsByGroup.get("current") ?? new Set<string>();
  const candidateIds = idsByGroup.get("candidate") ?? new Set<string>();
  const customIds = idsByGroup.get("custom") ?? new Set<string>();
  const candidateOnly = [...candidateIds].filter((id) => !currentIds.has(id));
  const currentOnly = [...currentIds].filter((id) => !candidateIds.has(id));
  const customOnly = [...customIds].filter((id) => !candidateIds.has(id));

  const relatedIds = new Set<string>();
  let relatedExpansion: Record<string, unknown> | null = null;
  if (readFlag("--expand-related")) {
    const targetLimit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(readOption("--target-limit") ?? "50", 10) || 50
      )
    );
    const targets = deriveExpansionTargets({
      candidateIds,
      mailboxEmail: email,
      memberships,
      messagesById,
    }).slice(0, targetLimit);
    const targetSummaries: Array<Record<string, unknown>> = [];
    const failedTargets: Array<Record<string, unknown>> = [];

    for (let offset = 0; offset < targets.length; offset += 3) {
      const batch = targets.slice(offset, offset + 3);
      const results = await Promise.allSettled(
        batch.map(async (target) => {
          const messages: MessageMetadata[] = [];
          let nextPageToken: string | null = null;
          let pages = 0;
          const query = `after:${gmailDate(target.firstSeenAt)} before:${gmailDate(target.lastSeenAt)} {from:${target.value} to:${target.value}} -in:spam -in:trash`;
          do {
            const response = await withTransientRetry(() =>
              executeComposioGmailFetchEmails({
                arguments: {
                  ids_only: false,
                  include_payload: false,
                  include_spam_trash: false,
                  max_results: maxResults,
                  ...(nextPageToken ? { page_token: nextPageToken } : {}),
                  query,
                  user_id: "me",
                  verbose: false,
                },
                connectedAccountId,
                userId: talentId,
              })
            );
            const payload = asRecord(response.data) ?? asRecord(response) ?? {};
            if (Array.isArray(payload.messages)) {
              messages.push(
                ...payload.messages
                  .map(normalizeMessage)
                  .filter(
                    (message): message is MessageMetadata => message !== null
                  )
              );
            }
            nextPageToken = cleanText(payload.nextPageToken, 500);
            pages += 1;
          } while (nextPageToken && pages < maxPages);
          return { messages, pages, query, target, truncated: !!nextPageToken };
        })
      );

      for (let index = 0; index < results.length; index += 1) {
        const settled = results[index];
        if (settled.status === "rejected") {
          failedTargets.push({
            ...safeFailure(settled.reason),
            kind: batch[index].kind,
            value: batch[index].value,
          });
          continue;
        }
        const result = settled.value;
        for (const message of result.messages) {
          relatedIds.add(message.id);
          messagesById.set(message.id, message);
          const names = memberships.get(message.id) ?? new Set<string>();
          names.add(`related:${result.target.kind}:${result.target.value}`);
          memberships.set(message.id, names);
        }
        targetSummaries.push({
          fetched: result.messages.length,
          kind: result.target.kind,
          pages: result.pages,
          query: result.query,
          truncated: result.truncated,
          value: result.target.value,
        });
      }
    }

    const additionalMetadata = [...relatedIds]
      .filter((id) => !candidateIds.has(id))
      .map((id) => messagesById.get(id))
      .filter((message): message is MessageMetadata => Boolean(message))
      .sort((left, right) =>
        String(right.receivedAt ?? "").localeCompare(
          String(left.receivedAt ?? "")
        )
      )
      .map((message) => ({
        from: message.from,
        matchedBy: [...(memberships.get(message.id) ?? [])],
        receivedAt: message.receivedAt,
        subject: message.subject,
      }));
    relatedExpansion = {
      additionalCount: additionalMetadata.length,
      additionalMetadata,
      failedTargets,
      targetCount: targets.length,
      targets: targetSummaries,
      uniqueCount: relatedIds.size,
    };
  }

  const evidenceIds = new Set([...candidateIds, ...relatedIds]);
  let expandedEvidenceThreads: Record<string, unknown> | null = null;
  if (readFlag("--expand-candidate-threads")) {
    const threadLimit = Math.min(
      500,
      Math.max(
        1,
        Number.parseInt(readOption("--thread-limit") ?? "200", 10) || 200
      )
    );
    const threadIds = [
      ...new Set(
        [...evidenceIds]
          .map((id) => messagesById.get(id)?.threadId)
          .filter((threadId): threadId is string => Boolean(threadId))
      ),
    ].slice(0, threadLimit);
    const client = createComposioClient();
    const expandedMessages = new Map<string, MessageMetadata>();
    const failedThreadIds: Array<Record<string, unknown>> = [];

    for (let offset = 0; offset < threadIds.length; offset += 5) {
      const batch = threadIds.slice(offset, offset + 5);
      const responses = await Promise.allSettled(
        batch.map((threadId) =>
          withTransientRetry(() =>
            client.executeTool<Record<string, unknown>>({
              accountId: connectedAccountId,
              arguments: { thread_id: threadId, user_id: "me" },
              slug: "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
              userId: talentId,
              version: COMPOSIO_GMAIL_TOOL_VERSION,
            })
          )
        )
      );
      for (let index = 0; index < responses.length; index += 1) {
        const settled = responses[index];
        if (settled.status === "rejected") {
          failedThreadIds.push({
            ...safeFailure(settled.reason),
            threadId: batch[index],
          });
          continue;
        }
        const response = settled.value;
        if (!Array.isArray(response.messages)) continue;
        for (const message of response.messages) {
          const normalized = normalizeMessage(message);
          if (normalized) expandedMessages.set(normalized.id, normalized);
        }
      }
    }

    const additionalMetadata = [...expandedMessages.values()]
      .filter((message) => !evidenceIds.has(message.id))
      .sort((left, right) =>
        String(right.receivedAt ?? "").localeCompare(
          String(left.receivedAt ?? "")
        )
      )
      .map((message) => ({
        from: message.from,
        receivedAt: message.receivedAt,
        subject: message.subject,
      }));
    expandedEvidenceThreads = {
      additionalCount: additionalMetadata.length,
      additionalMetadata,
      failedThreadIds,
      messageCount: expandedMessages.size,
      threadCount: threadIds.length,
      truncated: threadIds.length >= threadLimit,
    };
  }

  console.log(
    JSON.stringify(
      {
        account: maskEmail(email),
        comparison: {
          candidateOnly: candidateOnly.length,
          candidateUnique: candidateIds.size,
          currentOnly: currentOnly.length,
          currentUnique: currentIds.size,
          customOnly: customOnly.length,
          customUnique: customIds.size,
        },
        maxPages,
        maxResultsPerQuery: maxResults,
        ...(readFlag("--compact-output") ? {} : { queries: summaries }),
      },
      null,
      2
    )
  );

  if (readFlag("--show-metadata")) {
    const metadataLimit = Math.min(
      500,
      Math.max(
        1,
        Number.parseInt(readOption("--metadata-limit") ?? "50", 10) || 50
      )
    );
    const metadataSet = readOption("--metadata-set");
    const selectedIds =
      metadataSet === "candidate-only"
        ? candidateOnly
        : metadataSet === "current-only"
          ? currentOnly
          : metadataSet === "custom-only"
            ? customOnly
            : metadataSet === "candidate"
              ? [...candidateIds]
              : metadataSet === "current"
                ? [...currentIds]
                : metadataSet === "custom"
                  ? [...customIds]
                  : preset === "compare"
                    ? candidateOnly
                    : [...messagesById.keys()];
    const metadata = selectedIds
      .map((id) => {
        const message = messagesById.get(id);
        return message
          ? {
              from: message.from,
              matchedBy: [...(memberships.get(id) ?? [])],
              receivedAt: message.receivedAt,
              subject: message.subject,
              ...(readFlag("--show-ids")
                ? { id: message.id, threadId: message.threadId }
                : {}),
            }
          : null;
      })
      .filter(Boolean)
      .sort((left, right) =>
        String(right?.receivedAt ?? "").localeCompare(
          String(left?.receivedAt ?? "")
        )
      )
      .slice(0, metadataLimit);
    console.log(JSON.stringify({ metadata }, null, 2));
  }

  if (relatedExpansion) {
    console.log(JSON.stringify({ relatedExpansion }, null, 2));
  }

  if (expandedEvidenceThreads) {
    console.log(JSON.stringify({ expandedEvidenceThreads }, null, 2));
  }

  const expandedThreadIds = readOptions("--expand-thread-id");
  if (expandedThreadIds.length) {
    const client = createComposioClient();
    const threads = [];
    for (const threadId of expandedThreadIds) {
      const response = await client.executeTool<Record<string, unknown>>({
        accountId: connectedAccountId,
        arguments: { thread_id: threadId, user_id: "me" },
        slug: "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
        userId: talentId,
        version: COMPOSIO_GMAIL_TOOL_VERSION,
      });
      const messages = Array.isArray(response.messages)
        ? response.messages
            .map((value) => {
              const message = asRecord(value);
              const preview = asRecord(message?.preview);
              if (!message) return null;
              return {
                from: cleanText(message.sender ?? message.from, 500),
                receivedAt: cleanText(
                  message.messageTimestamp ??
                    message.internalDate ??
                    message.date,
                  120
                ),
                subject: cleanText(message.subject, 500),
                text: readFlag("--show-thread-text")
                  ? cleanMessageText(
                      message.messageText ?? preview?.body,
                      6_000
                    )
                  : undefined,
              };
            })
            .filter(Boolean)
        : [];
      threads.push({ messages, shape: summarizeShape(response), threadId });
    }
    console.log(JSON.stringify({ threads }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
