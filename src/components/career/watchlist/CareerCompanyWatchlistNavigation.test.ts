import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(
    process.cwd(),
    "src/components/career/watchlist/CareerCompanyWatchlistPanel.tsx"
  ),
  "utf8"
);

function sourceBlock(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("opening a company adds a navigable detail entry", () => {
  const openDetail = sourceBlock(
    "const handleOpenCompany",
    "const handleBackToList"
  );

  assert.match(openDetail, /router\.push/);
});

test("closing a company detail removes it from the current history entry", () => {
  const closeDetail = sourceBlock(
    "const handleBackToList",
    "const fetchWatchlistPage"
  );

  assert.match(closeDetail, /router\.replace/);
  assert.doesNotMatch(closeDetail, /router\.push/);
});
