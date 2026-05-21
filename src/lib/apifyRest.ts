export type ApifyRunResult = {
  defaultDatasetId: string;
  id: string;
  status: string;
};

const APIFY_API_BASE_URL = "https://api.apify.com/v2";
const TERMINAL_RUN_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
]);

export function getApifyApiToken(message = "APIFY_CLIENT_KEY is not configured") {
  const token = String(process.env.APIFY_CLIENT_KEY ?? "").trim();
  if (!token) {
    throw new Error(message);
  }
  return token;
}

function toApifyActorPath(actorId: string) {
  return encodeURIComponent(actorId.trim().replace(/\//g, "~"));
}

async function readApifyError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return response.statusText;

  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message ?? parsed.message ?? text.slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}

function normalizeRun(payload: unknown): ApifyRunResult {
  const wrapper =
    payload && typeof payload === "object"
      ? (payload as { data?: unknown })
      : {};
  const run =
    wrapper.data && typeof wrapper.data === "object"
      ? (wrapper.data as Record<string, unknown>)
      : payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};
  return {
    defaultDatasetId:
      typeof run.defaultDatasetId === "string" ? run.defaultDatasetId : "",
    id: typeof run.id === "string" ? run.id : "",
    status: typeof run.status === "string" ? run.status : "",
  };
}

async function fetchApifyRun(args: {
  runId: string;
  token: string;
  waitForFinishSeconds: number;
}) {
  const url = new URL(
    `${APIFY_API_BASE_URL}/actor-runs/${encodeURIComponent(args.runId)}`
  );
  url.searchParams.set("waitForFinish", String(args.waitForFinishSeconds));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.token}`,
    },
  });
  if (!response.ok) {
    throw new Error(
      `Apify run fetch failed: ${response.status} ${await readApifyError(
        response
      )}`
    );
  }

  return normalizeRun(await response.json());
}

export async function callApifyActor(args: {
  actorId: string;
  input: Record<string, unknown>;
  maxRunWaitSeconds?: number;
  token: string;
  waitForFinishSeconds: number;
}): Promise<ApifyRunResult> {
  const maxRunWaitSeconds =
    args.maxRunWaitSeconds ?? args.waitForFinishSeconds;
  const deadline = Date.now() + Math.max(1, maxRunWaitSeconds) * 1000;
  const url = new URL(
    `${APIFY_API_BASE_URL}/acts/${toApifyActorPath(args.actorId)}/runs`
  );
  url.searchParams.set("waitForFinish", String(args.waitForFinishSeconds));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.input),
  });

  if (!response.ok) {
    throw new Error(
      `Apify actor call failed: ${response.status} ${await readApifyError(
        response
      )}`
    );
  }

  let run = normalizeRun(await response.json());

  while (run.id && run.status && !TERMINAL_RUN_STATUSES.has(run.status)) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Apify actor timed out: ${run.status}`);
    }
    run = await fetchApifyRun({
      runId: run.id,
      token: args.token,
      waitForFinishSeconds: Math.max(
        1,
        Math.min(30, Math.floor(remainingMs / 1000))
      ),
    });
  }

  if (run.status && run.status !== "SUCCEEDED") {
    throw new Error(`Apify actor did not finish successfully: ${run.status}`);
  }
  if (!run.defaultDatasetId) {
    throw new Error("Apify actor returned no dataset");
  }

  return run;
}

export async function listApifyDatasetItems<T = unknown>(args: {
  datasetId: string;
  limit?: number;
  token: string;
}) {
  const url = new URL(
    `${APIFY_API_BASE_URL}/datasets/${encodeURIComponent(args.datasetId)}/items`
  );
  url.searchParams.set("clean", "true");
  url.searchParams.set("format", "json");
  if (args.limit) {
    url.searchParams.set("limit", String(args.limit));
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Apify dataset fetch failed: ${response.status} ${await readApifyError(
        response
      )}`
    );
  }

  const payload = (await response.json()) as
    | T[]
    | { data?: { items?: T[] }; items?: T[] };
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data?.items)) return payload.data.items;
  return [];
}
