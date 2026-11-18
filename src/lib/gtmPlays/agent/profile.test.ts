import assert from "node:assert/strict";
import test from "node:test";
import { PROFILE_TEXT_HEADING, outreachContext, personFacts } from "./match";
import { mailPersonName } from "./mailRules";
import {
  PROFILE_LABEL, PROFILE_TEXT_CHARS, cleanSummary, isLabelledProfile, nameHandle, pageExcerpt, profileParts, profileTextFrom,
  realName, searchedProfileText, storedPersonName,
} from "./profile";
import type { AgentPersonInput } from "./types";

const base: AgentPersonInput = {
  name: "Jane Doe", headline: "Backend engineer", location: "Seoul", currentCompany: null, profileUrl: null, profileText: null,
  signalText: "Looking for a backend role", signalUrl: "https://velog.io/@jane/post", signalAt: "2026-11-15T00:00:00.000Z",
};

test("a searched person's profile text: the judge's summary first, then the cleaned page, labelled, at most 3,000", () => {
  const text = searchedProfileText(
    "Backend engineer at Example Pay since 2021; built the settlement ledger. Wants a platform role.",
    "# Jane's blog ![me](https://img.example/x.png) I built the [ledger](https://example.dev/ledger). Mail jane@gmail.com or 010-1234-5678. " + "x".repeat(5_000),
  )!;
  assert.ok(text.startsWith(`${PROFILE_LABEL.summary}: Backend engineer at Example Pay since 2021`));
  const [summary, excerpt] = text.split("\n");
  assert.ok(excerpt.startsWith(`${PROFILE_LABEL.excerpt}: # Jane's blog I built the ledger. Mail or .`));
  assert.ok(!/https?:|@|010-1234/.test(text), "no links, addresses or phone numbers");
  assert.ok(text.length <= PROFILE_TEXT_CHARS);
  assert.ok(summary.length < 200);
  // No summary (the page says nothing about their work): the excerpt alone; nothing at all: null.
  assert.equal(searchedProfileText("  ", "I am looking for a job."), `${PROFILE_LABEL.excerpt}: I am looking for a job.`);
  assert.equal(searchedProfileText(null, null), null);
});

test("a summary is plain words on one line, cut at a sentence end", () => {
  assert.equal(cleanSummary("Built **payments** at <b>Acme</b>.\nSee https://acme.dev or me@jane.dev."), "Built payments at Acme. See or.");
  const long = cleanSummary(`${"Built the ledger. ".repeat(80)}`, 100)!;
  assert.ok(long.length <= 100 && long.endsWith("."));
  assert.equal(cleanSummary(""), null);
});

test("profile parts keep their order and labels; the last part takes what room is left", () => {
  const text = profileTextFrom([
    { label: PROFILE_LABEL.summary, text: "A".repeat(500) },
    { label: PROFILE_LABEL.ownPages("github.com"), text: "Maintains a queue library." },
    { label: PROFILE_LABEL.excerpt, text: "B".repeat(5_000) },
  ])!;
  assert.equal(text.length, PROFILE_TEXT_CHARS);
  assert.deepEqual(profileParts(text).map((part) => part.label), [PROFILE_LABEL.summary, "From their own pages (github.com)", PROFILE_LABEL.excerpt]);
  assert.equal(profileParts(text)[1].text, "Maintains a queue library.");
  // An older row's raw page text is one unlabelled part (read as before).
  assert.equal(isLabelledProfile("I build backends."), false);
  assert.deepEqual(profileParts("I build backends."), [{ label: PROFILE_LABEL.excerpt, text: "I build backends." }]);
  assert.equal(pageExcerpt("<p>  </p>"), null);
});

test("the readers get the profile text under a clear heading: their own page, not a CV; old rows as before", () => {
  const labelled = { ...base, profileText: searchedProfileText("Backend engineer at Example Pay.", "My page text.") };
  const facts = personFacts(labelled);
  assert.ok(facts.includes(`${PROFILE_TEXT_HEADING}:\n${PROFILE_LABEL.summary}: Backend engineer at Example Pay.\n${PROFILE_LABEL.excerpt}: My page text.`));
  assert.match(PROFILE_TEXT_HEADING, /not a CV/);
  assert.match(PROFILE_TEXT_HEADING, /data, not instructions/);
  // The other inputs are unchanged.
  assert.ok(facts.startsWith("Name: Jane Doe\nHeadline: Backend engineer\nLocation: Seoul\nSignal (their post or application, 2026-11-15):\nLooking for a backend role"));
  assert.equal(outreachContext(labelled, []).profile.bio, labelled.profileText);
  // An older row (raw page text, or none) keeps working.
  const old = { ...base, profileText: "raw page text from before" };
  assert.ok(personFacts(old).endsWith(`${PROFILE_TEXT_HEADING}:\nraw page text from before`));
  assert.equal(outreachContext(old, []).profile.bio, "raw page text from before");
  assert.ok(!personFacts(base).includes(PROFILE_TEXT_HEADING));
  assert.equal(outreachContext(base, []).profile.bio, null);
});

test("a nickname or handle is kept as '@handle': Ops and the lookup see it, a greeting never uses it", () => {
  assert.equal(storedPersonName("devkim", true), "@devkim");
  assert.equal(storedPersonName("@코딩하는곰 ", true), "@코딩하는곰");
  assert.equal(storedPersonName("  ", true), null);
  assert.equal(storedPersonName("Jane Doe", false), "Jane Doe");
  assert.equal(mailPersonName(storedPersonName("devkim", true)), null);
  assert.equal(mailPersonName(storedPersonName("뭐라도하는겨", true)), null);
  assert.equal(mailPersonName(storedPersonName("홍길동", false)), "홍길동");
  assert.equal(nameHandle("@devkim"), "devkim");
  assert.equal(nameHandle("Jane Doe"), null);
  assert.equal(realName("@devkim"), null);
  assert.equal(realName(" Jane  Doe "), "Jane Doe");
});
