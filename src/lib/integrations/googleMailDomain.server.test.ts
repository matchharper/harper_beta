import assert from "node:assert/strict";
import test from "node:test";
import { isGoogleMailAddress } from "./googleMailDomain.server";

test("Gmail and Google-hosted company mail qualify; other providers and failed lookups do not", async () => {
  const asked: string[] = [];
  const lookup = async (domain: string) => {
    asked.push(domain);
    if (domain === "startup.example") return [{ exchange: "aspmx.l.google.com" }, { exchange: "alt1.aspmx.l.google.com" }];
    if (domain === "newer.example") return [{ exchange: "smtp.google.com" }];
    if (domain === "microsoft.example") return [{ exchange: "microsoft-example.mail.protection.outlook.com" }];
    if (domain === "lookalike.example") return [{ exchange: "mx.notgoogle.com" }];
    if (domain === "nomail.example") throw Object.assign(new Error("none"), { code: "ENODATA" });
    throw Object.assign(new Error("dns down"), { code: "ESERVFAIL" });
  };
  assert.equal(await isGoogleMailAddress("Person@Gmail.com", lookup), true);
  assert.equal(await isGoogleMailAddress("person@googlemail.com", lookup), true);
  assert.deepEqual(asked, []);
  assert.equal(await isGoogleMailAddress("ceo@startup.example", lookup), true);
  assert.equal(await isGoogleMailAddress("ceo@newer.example", lookup), true);
  assert.equal(await isGoogleMailAddress("ceo@microsoft.example", lookup), false);
  assert.equal(await isGoogleMailAddress("ceo@lookalike.example", lookup), false);
  assert.equal(await isGoogleMailAddress("ceo@nomail.example", lookup), false);
  assert.equal(await isGoogleMailAddress(null, lookup), false);
  assert.equal(await isGoogleMailAddress("no-at-sign", lookup), false);

  // Definite answers are reused; a broken lookup is asked again next time.
  asked.length = 0;
  await isGoogleMailAddress("other@startup.example", lookup);
  await isGoogleMailAddress("other@nomail.example", lookup);
  assert.equal(await isGoogleMailAddress("ceo@flaky.example", lookup), false);
  assert.equal(await isGoogleMailAddress("ceo@flaky.example", lookup), false);
  assert.deepEqual(asked, ["flaky.example", "flaky.example"]);
});

test("a slow lookup gives up without blocking the status response", async () => {
  const started = Date.now();
  assert.equal(await isGoogleMailAddress("ceo@slow.example", () => new Promise(() => undefined)), false);
  assert.ok(Date.now() - started < 3000);
});
