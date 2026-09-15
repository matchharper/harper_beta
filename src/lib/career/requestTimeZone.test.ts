import assert from "node:assert/strict";
import test from "node:test";

import { resolveCareerRequestTimeZone } from "./requestTimeZone";

test("prefers the current Vercel request location timezone", () => {
  const request = {
    headers: new Headers({ "x-vercel-ip-timezone": "America/Chicago" }),
  };

  assert.equal(
    resolveCareerRequestTimeZone(request, "Asia/Tokyo"),
    "America/Chicago"
  );
});

test("uses a valid browser timezone when request geolocation is unavailable", () => {
  const request = { headers: new Headers() };

  assert.equal(
    resolveCareerRequestTimeZone(request, "Europe/Paris"),
    "Europe/Paris"
  );
  assert.equal(resolveCareerRequestTimeZone(request, "invalid"), "Asia/Seoul");
});
