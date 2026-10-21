import assert from "node:assert/strict";
import test from "node:test";
import type { GetServerSidePropsContext } from "next";
import { assignLandingStatsVariant } from "./landingStatsExperiment.server";
import { LANDING_STATS_COOKIE } from "./landingStatsExperiment";

function request(cookie?: string, override?: string) {
  const headers = new Map<string, string | string[]>([
    ["Set-Cookie", ["NEXT_LOCALE=ko"]],
  ]);
  const context = {
    req: { cookies: { [LANDING_STATS_COOKIE]: cookie } },
    res: {
      getHeader: (key: string) => headers.get(key),
      setHeader: (key: string, value: string | string[]) =>
        headers.set(key, value),
    },
    query: { landing_stats: override },
  } as unknown as GetServerSidePropsContext;
  return { context, headers };
}

test("assigns a new browser and preserves locale cookies, then remains stable", () => {
  const first = request();
  const variant = assignLandingStatsVariant(first.context);
  assert.ok(variant === "A" || variant === "B");
  assert.equal(first.headers.get("Cache-Control"), "private, no-store");
  const cookies = first.headers.get("Set-Cookie") as string[];
  assert.equal(cookies[0], "NEXT_LOCALE=ko");
  assert.ok(cookies[1].includes(`${LANDING_STATS_COOKIE}=${variant}; Path=/`));
  for (let index = 0; index < 10; index++) {
    assert.equal(assignLandingStatsVariant(request(variant).context), variant);
  }
});

test("production ignores forced preview and marks new cookies Secure", () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    assert.equal(assignLandingStatsVariant(request("A", "B").context), "A");
    const first = request("invalid", "B");
    assignLandingStatsVariant(first.context);
    assert.ok(
      (first.headers.get("Set-Cookie") as string[])[1].endsWith("; Secure")
    );
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previous });
  }
});

test("local preview persists the chosen arm", () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  try {
    assert.equal(assignLandingStatsVariant(request("A", "B").context), "B");
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previous });
  }
});
