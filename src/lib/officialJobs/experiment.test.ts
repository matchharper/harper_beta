import assert from "node:assert/strict";
import test from "node:test";
import type { GetServerSidePropsContext } from "next";
import { assignOfficialJobsLayoutVariant } from "./experiment.server";
import {
  OFFICIAL_JOBS_LAYOUT_COOKIE,
  OFFICIAL_JOBS_LAYOUT_ABTEST_A,
  OFFICIAL_JOBS_LAYOUT_ABTEST_B,
  getOfficialJobsLayoutAbtestType,
  readOfficialJobsLayoutVariant,
} from "./experiment";

function request(cookie?: string, override?: string) {
  const headers = new Map<string, string | string[]>([
    ["Set-Cookie", ["NEXT_LOCALE=ko"]],
  ]);
  const context = {
    req: { cookies: { [OFFICIAL_JOBS_LAYOUT_COOKIE]: cookie } },
    res: {
      getHeader: (key: string) => headers.get(key),
      setHeader: (key: string, value: string | string[]) =>
        headers.set(key, value),
    },
    query: { jobs_layout: override },
  } as unknown as GetServerSidePropsContext;
  return { context, headers };
}

test("assigns a new browser and preserves locale cookies, then remains stable", () => {
  const first = request();
  const variant = assignOfficialJobsLayoutVariant(first.context);
  assert.ok(variant === "A" || variant === "B");
  assert.equal(first.headers.get("Cache-Control"), "private, no-store");
  const cookies = first.headers.get("Set-Cookie") as string[];
  assert.equal(cookies[0], "NEXT_LOCALE=ko");
  assert.ok(
    cookies[1].includes(`${OFFICIAL_JOBS_LAYOUT_COOKIE}=${variant}; Path=/`)
  );
  for (let index = 0; index < 10; index++) {
    assert.equal(
      assignOfficialJobsLayoutVariant(request(variant).context),
      variant
    );
  }
});

test("production ignores forced preview and marks new cookies Secure", () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    assert.equal(
      assignOfficialJobsLayoutVariant(request("A", "B").context),
      "A"
    );
    const first = request("invalid", "B");
    assignOfficialJobsLayoutVariant(first.context);
    assert.ok(
      (first.headers.get("Set-Cookie") as string[])[1].endsWith("; Secure")
    );
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previous });
  }
});

test("attribution reads only the exact experiment cookie and retains legacy traffic", () => {
  assert.equal(
    getOfficialJobsLayoutAbtestType(
      readOfficialJobsLayoutVariant(`other=B; ${OFFICIAL_JOBS_LAYOUT_COOKIE}=A`)
    ),
    OFFICIAL_JOBS_LAYOUT_ABTEST_A
  );
  assert.equal(
    getOfficialJobsLayoutAbtestType(
      readOfficialJobsLayoutVariant(`${OFFICIAL_JOBS_LAYOUT_COOKIE}=B`)
    ),
    OFFICIAL_JOBS_LAYOUT_ABTEST_B
  );
  assert.equal(
    readOfficialJobsLayoutVariant(`prefix_${OFFICIAL_JOBS_LAYOUT_COOKIE}=B`),
    null
  );
  assert.equal(
    readOfficialJobsLayoutVariant(`${OFFICIAL_JOBS_LAYOUT_COOKIE}=broken`),
    null
  );
  assert.equal(
    getOfficialJobsLayoutAbtestType(null),
    "official_jobs_landing_v1"
  );
});
