import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { GoogleAuth } from "google-auth-library";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const GA4_PROPERTY_ID =
  process.env.GROWTH_CANDIDATE_GA4_PROPERTY_ID?.trim() || "525158909";
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
    kstDateFormatter.formatToParts(date).map((part) => [part.type, part.value])
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
    filter: orFilter(
      filterContains("sessionSource", "instagram"),
      filterContains("sessionSource", "instantdm.com")
    ),
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

async function getAccessToken() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  if (!token) {
    throw new Error("Google Analytics access token could not be created");
  }

  return token;
}

async function runReport(accessToken, body) {
  const response = await fetch(GA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
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
  const trafficMetrics = ["sessions", "totalUsers", "newUsers"];

  const trafficPayload = await runReport(accessToken, {
    dateRanges: [dateRange],
    dimensionFilter: channel.filter,
    metrics: trafficMetrics.map((name) => ({ name })),
  });
  const signUpPayload = await runReport(accessToken, {
    dateRanges: [dateRange],
    dimensionFilter: andFilter(
      channel.filter,
      filterExact("eventName", "sign_up")
    ),
    metrics: ["eventCount", "totalUsers"].map((name) => ({ name })),
  });

  const trafficValues = readMetricRow(trafficPayload, trafficMetrics);
  const signUpValues = readMetricRow(signUpPayload, [
    "eventCount",
    "totalUsers",
  ]);
  const signUps = signUpValues.eventCount ?? 0;
  const newSignUpUsers = signUpValues.totalUsers ?? 0;
  const conversionRate =
    trafficValues.sessions > 0 ? signUps / trafficValues.sessions : 0;

  return {
    ...trafficValues,
    conversionRate,
    label: channel.label,
    newSignUpUsers,
    signUps,
  };
}

function formatInteger(value) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function pad(value, size) {
  return String(value).padEnd(size, " ");
}

function formatSlackMessage({ dateRange, rows }) {
  const sortedRows = rows.slice().sort((a, b) => b.sessions - a.sessions);
  const tableLines = [
    [
      pad("소스/채널", 13),
      pad("세션", 7),
      pad("유저", 6),
      pad("신규 유저", 8),
      pad("회원가입", 8),
      pad("신규 가입자", 9),
      "전환율",
    ].join(" "),
    ...sortedRows.map((row) =>
      [
        pad(row.label, 16),
        pad(formatInteger(row.sessions), 8),
        pad(formatInteger(row.totalUsers), 7),
        pad(formatInteger(row.newUsers), 9),
        pad(formatInteger(row.signUps), 9),
        pad(formatInteger(row.newSignUpUsers), 10),
        formatPercent(row.conversionRate),
      ].join(" ")
    ),
  ];

  return [
    "*Growth candidate GA 리포트*",
    `기간: ${dateRange.startDate} 00:00 - ${dateRange.endDate} 23:59 KST`,
    "전환율: GA4 sign_up 이벤트 수 / 세션",
    "신규 가입자: sign_up 이벤트가 찍힌 unique user 수",
    "",
    "```",
    tableLines.join("\n"),
    "```",
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
  const accessToken = await getAccessToken();
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
