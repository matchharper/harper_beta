import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MessagesProvider } from "@/i18n/useMessage";
import type { CareerTalentContext } from "../types";
import CareerTalentContextSection from "./CareerTalentContextSection";

const briefRow = (
  id: number,
  key: string | null,
  label: string,
  content: string
): CareerTalentContext => ({
  collection: "brief",
  content,
  createdAt: "2026-09-10T00:00:00.000Z",
  id,
  importance: null,
  key,
  label,
  ref: id,
  revision: 1,
  updatedAt: "2026-09-10T00:00:00.000Z",
});

test("shows every Brief row as saved, with or without a compatibility key", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <CareerTalentContextSection
        engagementTypesControl={<button type="button">풀타임</button>}
        brief={[
          briefRow(1, null, "제품 의사결정 참여", "제품 논의부터 참여"),
          briefRow(2, "location", "선호 근무 지역", "서울 또는 원격"),
          briefRow(3, null, "보상", "현재 총보상 이상"),
        ]}
        memories={[]}
      />
    </MessagesProvider>
  );

  const labels = [
    "근무 형태",
    "제품 의사결정 참여",
    "선호 근무 지역",
    "보상",
  ];
  const positions = labels.map((label) => html.indexOf(label));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((left, right) => left - right)
  );
  assert.equal(html.match(/>보상</g)?.length, 1);
  assert.doesNotMatch(html, /빈칸|다음 역할|피하고 싶은 것/);
  assert.match(html, /보상[\s\S]*현재 총보상 이상/);
  assert.match(html, /<dl[^>]*>[\s\S]*근무 형태[\s\S]*풀타임[\s\S]*<\/dl>/);
});

test("shows an empty state instead of blank slots when the Brief is empty", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="en">
      <CareerTalentContextSection brief={[]} memories={[]} />
    </MessagesProvider>
  );

  assert.match(html, /You don&#x27;t have any search criteria yet\./);
  assert.doesNotMatch(html, /Blank|Next role|Compensation/);
});
