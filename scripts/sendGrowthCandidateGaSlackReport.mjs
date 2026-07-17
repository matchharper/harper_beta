import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const GA4_PROPERTY_ID =
  process.env.GROWTH_CANDIDATE_GA4_PROPERTY_ID?.trim() || "525158909";
const GOOGLE_CLOUD_QUOTA_PROJECT =
  process.env.GROWTH_CANDIDATE_GA_QUOTA_PROJECT?.trim() ||
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim() ||
  "ornate-shape-481512-j9";
const SLACK_WEBHOOK_URL = process.env.SLACK_GROWTH_CANDIDATE_TOKEN?.trim();
const TIME_ZONE = "Asia/Seoul";
const GA_API_URL = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`;
const DRY_RUN = process.argv.includes("--dry-run");

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getKstDateParts(date) {
  const parts = Object.fromEntries(
    kstDateFormatter.formatToParts(date).map((part) => [
      part.type,
      part.value,
    ])
  );

  return {
    day: parts.day,
    month: parts.month,
    year: parts.year,
  };
}

function formatKstDate(date) {
  const parts = getKstDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getPreviousCompleteKstDateRange(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
  const date = formatKstDate(yesterday);
  return {
    endDate: date,
    startDate: date,
  };
}

function filterExact(fieldName, value) {
  return {
    filter: {
      fieldName,
      stringFilter: {
        caseSensitive: false,
        matchType: "EXACT",
        value,
      },
    },
  };
}

function filterContains(fieldName, value) {
  return {
    filter: {
      fieldName,
      stringFilter: {
        caseSensitive: false,
        matchType: "CONTAINS",
        value,
      },
    },
  };
}

function andFilter(...expressions) {
  return {
    andGroup: {
      expressions,
    },
  };
}

function orFilter(...expressions) {
  return {
    orGroup: {
      expressions,
    },
  };
}

const channelFilters = [
  {
    label: "LinkedIn",
    filter: orFilter(
      filterContains("sessionSource", "linkedin"),
      filterExact("sessionSource", "lnkd.in")
    ),
  },
  {
    label: "Google organic",
    filter: andFilter(
      filterExact("sessionSource", "google"),
      filterExact("sessionMedium", "organic")
    ),
  },
  {
    label: "Threads",
    filter: filterContains("sessionSource", "threads"),
  },
  {
    label: "Instagram",
    filter: filterContains("sessionSource", "instagram"),
  },
  {
    label: "AI assistants",
    filter: orFilter(
      filterExact("sessionDefaultChannelGroup", "AI Assistant"),
      filterExact("sessionMedium", "ai-assistant"),
      filterContains("sessionSource", "chatgpt"),
      filterContains("sessionSource", "claude"),
      filterContains("sessionSource", "gemini")
    ),
  },
];

function getAccessToken() {
  return execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function runReport(accessToken, body) {
  const response = await fetch(GA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-goog-user-project": GOOGLE_CLOUD_QUOTA_PROJECT,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `GA4 API request failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

function readMetricRow(payload, metricNames) {
  const metricValues = payload.rows?.[0]?.metricValues ?? [];
  return Object.fromEntries(
    metricNames.map((metricName, index) => [
      metricName,
      Number(metricValues[index]?.value ?? 0),
    ])
  );
}

async function fetchChannelMetrics(accessToken, dateRange, channel) {
  const metrics = [
    "sessions",
    "totalUsers",
    "newUsers",
    "engagedSessions",
    "engagementRate",
    "averageSessionDuration",
    "screenPageViews",
  ];

  const payload = await runReport(accessToken, {
    dateRanges: [dateRange],
    dimensionFilter: channel.filter,
    metrics: metrics.map((name) => ({ name })),
  });

  const signUpPayload = await runReport(accessToken, {
    dateRanges: [dateRange],
    dimensionFilter: andFilter(
      channel.filter,
      filterExact("eventName", "sign_up")
    ),
    metrics: [{ name: "eventCount" }],
  });

  const values = readMetricRow(payload, metrics);
  const signUps = readMetricRow(signUpPayload, ["eventCount"]).eventCount;
  return {
    ...values,
    label: channel.label,
    signUpRate: values.sessions > 0 ? signUps / values.sessions : 0,
    signUps,
    viewsPerSession:
      values.sessions > 0 ? values.screenPageViews / values.sessions : 0,
  };
}

function formatInteger(value) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSeconds(value) {
  return `${Math.round(value)}초`;
}

function pad(value, size) {
  return String(value).padEnd(size, " ");
}

function formatSlackMessage({ dateRange, rows }) {
  const sortedRows = rows.slice().sort((a, b) => b.sessions - a.sessions);
  const tableLines = [
    [
      pad("소스/채널", 16),
      pad("세션", 8),
      pad("유저", 7),
      pad("신규 유저", 9),
      pad("참여율", 8),
      pad("평균 세션", 10),
      pad("회원가입", 8),
      "가입률",
    ].join(" "),
    ...sortedRows.map((row) =>
      [
        pad(row.label, 16),
        pad(formatInteger(row.sessions), 8),
        pad(formatInteger(row.totalUsers), 7),
        pad(formatInteger(row.newUsers), 9),
        pad(formatPercent(row.engagementRate), 8),
        pad(formatSeconds(row.averageSessionDuration), 10),
        pad(formatInteger(row.signUps), 8),
        formatPercent(row.signUpRate),
      ].join(" ")
    ),
  ];

  const details = sortedRows.map(
    (row) =>
      `- ${row.label}: 세션당 페이지뷰 ${row.viewsPerSession.toFixed(
        1
      )}, 참여 세션 ${formatInteger(row.engagedSessions)}`
  );

  return [
    "*Growth candidate GA 리포트*",
    `기간: ${dateRange.startDate} 00:00 - ${dateRange.endDate} 23:59 KST`,
    "",
    "```",
    tableLines.join("\n"),
    "```",
    "",
    "*추가 참고*",
    details.join("\n"),
    "",
    "*읽는 법*",
    "- 세션: 방문 횟수",
    "- 유저: 중복을 제거한 방문자 수",
    "- 신규 유저: GA가 처음 방문으로 인식한 유저 수",
    "- 참여율: GA4 기준 참여 세션 비율",
    "- 평균 세션: 세션당 평균 머문 시간",
    "- 회원가입/가입률: GA4 `sign_up` 이벤트 수와 세션 대비 비율",
  ].join("\n");
}

async function sendSlackMessage(text) {
  if (!SLACK_WEBHOOK_URL) {
    throw new Error("SLACK_GROWTH_CANDIDATE_TOKEN is not configured");
  }

  if (!SLACK_WEBHOOK_URL.startsWith("https://hooks.slack.com/")) {
    throw new Error(
      "SLACK_GROWTH_CANDIDATE_TOKEN must be a Slack incoming webhook URL"
    );
  }

  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Slack webhook failed (${response.status}): ${body}`);
  }
}

async function main() {
  const dateRange = getPreviousCompleteKstDateRange();
  const accessToken = getAccessToken();
  const rows = [];

  for (const channel of channelFilters) {
    rows.push(await fetchChannelMetrics(accessToken, dateRange, channel));
  }

  const message = formatSlackMessage({
    dateRange,
    rows,
  });

  if (DRY_RUN) {
    console.log(message);
    return;
  }

  await sendSlackMessage(message);
  console.log("Growth candidate GA Slack report sent.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
