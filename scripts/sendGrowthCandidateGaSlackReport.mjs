import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { GoogleAuth } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const GA4_PROPERTY_ID =
  process.env.GROWTH_CANDIDATE_GA4_PROPERTY_ID?.trim() || "525158909";
const SLACK_WEBHOOK_URL = process.env.SLACK_GROWTH_CANDIDATE_TOKEN?.trim();
const TIME_ZONE = "Asia/Seoul";
const GA_API_URL = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`;
const THREADS_PROFILE_UTM_TYPE =
  "utm:utm_source=threads&utm_medium=social&utm_content=link_in_bio";
const DRY_RUN = process.argv.includes("--dry-run");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Supabase credentials are not configured");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  return { day: parts.day, month: parts.month, year: parts.year };
}

function formatKstDate(date) {
  const parts = getKstDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getPreviousCompleteKstDateRange(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
  const date = formatKstDate(yesterday);
  const start = new Date(`${date}T00:00:00+09:00`);
  return {
    endDate: date,
    endExclusiveIso: new Date(
      start.getTime() + 24 * 60 * 60_000
    ).toISOString(),
    startDate: date,
    startIso: start.toISOString(),
  };
}

function filterExact(fieldName, value) {
  return {
    filter: {
      fieldName,
      stringFilter: { caseSensitive: false, matchType: "EXACT", value },
    },
  };
}

function filterContains(fieldName, value) {
  return {
    filter: {
      fieldName,
      stringFilter: { caseSensitive: false, matchType: "CONTAINS", value },
    },
  };
}

function andFilter(...expressions) {
  return { andGroup: { expressions } };
}

function orFilter(...expressions) {
  return { orGroup: { expressions } };
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

async function runGaReport(accessToken, body) {
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

async function fetchGaChannelMetrics(accessToken, dateRange, channel) {
  const trafficMetrics = [
    "sessions",
    "totalUsers",
    "newUsers",
    "engagementRate",
  ];
  const trafficPayload = await runGaReport(accessToken, {
    dateRanges: [
      { startDate: dateRange.startDate, endDate: dateRange.endDate },
    ],
    dimensionFilter: channel.filter,
    metrics: trafficMetrics.map((name) => ({ name })),
  });
  const signUpPayload = await runGaReport(accessToken, {
    dateRanges: [
      { startDate: dateRange.startDate, endDate: dateRange.endDate },
    ],
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
  const sessions = trafficValues.sessions ?? 0;

  return {
    ...trafficValues,
    conversionRate: sessions > 0 ? signUps / sessions : 0,
    label: channel.label,
    newSignUpUsers: signUpValues.totalUsers ?? 0,
    signUps,
  };
}

async function fetchAllRows(table, select, buildQuery) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + 999);
    query = buildQuery(query);
    const { data, error } = await query;
    if (error) {
      throw new Error(`Supabase ${table} query failed: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function extractLoginEmail(type) {
  const value = String(type ?? "");
  if (!value.startsWith("login_email:")) return null;
  const rest = value.slice("login_email:".length);
  const sourceSeparatorIndex = rest.lastIndexOf(":");
  return (
    (sourceSeparatorIndex === -1
      ? rest
      : rest.slice(0, sourceSeparatorIndex)
    ).trim() || null
  );
}

function getLoginSource(type) {
  const value = String(type ?? "");
  if (!value.startsWith("login_email:")) return "unknown";
  const rest = value.slice("login_email:".length);
  const sourceSeparatorIndex = rest.lastIndexOf(":");
  return sourceSeparatorIndex === -1
    ? "unknown"
    : rest.slice(sourceSeparatorIndex + 1).trim() || "unknown";
}

async function fetchThreadsProfileMetrics(dateRange) {
  const [landingLogs, signupLogs, talentUsers] = await Promise.all([
    fetchAllRows("landing_logs", "local_id,type,created_at", (query) =>
      query
        .gte("created_at", dateRange.startIso)
        .lt("created_at", dateRange.endExclusiveIso)
        .order("id", { ascending: true })
    ),
    fetchAllRows("logs", "user_id,type,created_at", (query) =>
      query
        .eq("type", "career_signup_completed")
        .gte("created_at", dateRange.startIso)
        .lt("created_at", dateRange.endExclusiveIso)
        .order("id", { ascending: true })
    ),
    fetchAllRows("talent_users", "user_id,email,created_at", (query) =>
      query.order("created_at", { ascending: true })
    ),
  ]);

  const profileLocalIds = new Set(
    landingLogs
      .filter((log) => log.type === THREADS_PROFILE_UTM_TYPE)
      .map((log) => log.local_id)
      .filter(Boolean)
  );
  const profileLogs = landingLogs.filter((log) =>
    profileLocalIds.has(log.local_id)
  );
  const entryLogs = profileLogs.filter(
    (log) =>
      String(log.type ?? "").startsWith("new_visit:") ||
      String(log.type ?? "").startsWith("new_session:")
  );
  const totalUsers = new Set(
    entryLogs.map((log) => log.local_id).filter(Boolean)
  ).size;
  const newUsers = new Set(
    entryLogs
      .filter((log) => String(log.type ?? "").startsWith("new_visit:"))
      .map((log) => log.local_id)
      .filter(Boolean)
  ).size;
  const engagedUsers = new Set(
    profileLogs
      .filter((log) =>
        String(log.type ?? "").startsWith("first_scroll_down:")
      )
      .map((log) => log.local_id)
      .filter(Boolean)
  ).size;

  const userIdByEmail = new Map(
    talentUsers.map((user) => [
      String(user.email ?? "").trim().toLowerCase(),
      user.user_id,
    ])
  );
  const signupUserIds = new Set(
    signupLogs.map((log) => log.user_id).filter(Boolean)
  );
  const firstSourceBySignupUserId = new Map();
  const profileLoginUserIds = new Set();

  for (const log of landingLogs) {
    const email = extractLoginEmail(log.type);
    if (!email) continue;
    const userId = userIdByEmail.get(email.toLowerCase());
    if (!userId || !signupUserIds.has(userId)) continue;
    const source = getLoginSource(log.type);
    if (!firstSourceBySignupUserId.has(userId)) {
      firstSourceBySignupUserId.set(userId, source);
    }
    if (profileLocalIds.has(log.local_id)) profileLoginUserIds.add(userId);
  }

  const attributedSignupUserIds = new Set(
    [...profileLoginUserIds].filter((userId) =>
      String(firstSourceBySignupUserId.get(userId) ?? "").includes("threads")
    )
  );
  const signUps = signupLogs.filter((log) =>
    attributedSignupUserIds.has(log.user_id)
  ).length;
  const sessions = entryLogs.length;

  return {
    engagementRate: totalUsers > 0 ? engagedUsers / totalUsers : 0,
    label: "Threads 프로필 링크",
    newSignUpUsers: attributedSignupUserIds.size,
    newUsers,
    signUps,
    sessions,
    totalUsers,
    conversionRate: sessions > 0 ? signUps / sessions : 0,
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

function formatTableRow(row) {
  return [
    pad(row.label, 18),
    pad(formatInteger(row.sessions), 8),
    pad(formatInteger(row.totalUsers), 7),
    pad(formatInteger(row.newUsers), 9),
    pad(formatInteger(row.signUps), 9),
    pad(formatInteger(row.newSignUpUsers), 10),
    pad(formatPercent(row.engagementRate), 8),
    formatPercent(row.conversionRate),
  ].join(" ");
}

function formatSlackMessage({ dateRange, gaRows, threadsProfileRow }) {
  const sortedGaRows = gaRows.slice().sort((a, b) => b.sessions - a.sessions);
  const tableRows = sortedGaRows.flatMap((row) =>
    row.label === "Threads"
      ? [formatTableRow(row), formatTableRow(threadsProfileRow)]
      : [formatTableRow(row)]
  );
  const tableLines = [
    [
      pad("소스/채널", 15),
      pad("세션", 7),
      pad("유저", 6),
      pad("신규 유저", 8),
      pad("회원가입", 8),
      pad("신규 가입자", 9),
      pad("참여율", 7),
      "전환율",
    ].join(" "),
    ...tableRows,
  ];

  return [
    "*Growth candidate GA 리포트*",
    `기간: ${dateRange.startDate} 00:00 - ${dateRange.endDate} 23:59 KST`,
    "기본 채널: GA4 기준",
    "Threads 프로필 링크: Supabase landing_logs / career_signup_completed 기준",
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
    headers: { "Content-Type": "application/json" },
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
  const [gaRows, threadsProfileRow] = await Promise.all([
    Promise.all(
      channelFilters.map((channel) =>
        fetchGaChannelMetrics(accessToken, dateRange, channel)
      )
    ),
    fetchThreadsProfileMetrics(dateRange),
  ]);
  const message = formatSlackMessage({
    dateRange,
    gaRows,
    threadsProfileRow,
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
