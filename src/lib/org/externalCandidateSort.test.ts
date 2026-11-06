import assert from "node:assert/strict";
import test from "node:test";
import type { ExternalCandidateView } from "@/lib/org/agent/externalSourcing";
import { sortExternalCandidates } from "./externalCandidateSort";

const person = (id: string, rank: number | null | undefined): ExternalCandidateView =>
  ({ id, rank }) as unknown as ExternalCandidateView;

// The server's order: the newest search (a, b, c) before the older one (d, e).
const listed = [person("a", 1), person("b", 2), person("c", null), person("d", 1), person("e", 2)];
const ids = (people: ExternalCandidateView[]) => people.map((one) => one.id);

test("최신순 keeps the server's order, newest search first", () => {
  assert.deepEqual(ids(sortExternalCandidates(listed, "latest")), ["a", "b", "c", "d", "e"]);
});

test("추천순 puts Harper's best of each search first and unranked people last", () => {
  assert.deepEqual(ids(sortExternalCandidates(listed, "recommended")), ["a", "d", "b", "e", "c"]);
});

test("추천순 treats a missing rank like no rank and does not change the input", () => {
  const input = [person("x", undefined), person("y", 3)];
  assert.deepEqual(ids(sortExternalCandidates(input, "recommended")), ["y", "x"]);
  assert.deepEqual(ids(input), ["x", "y"]);
});
