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

test("pins the five legacy preference fields above the remaining Brief rows", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <CareerTalentContextSection
        engagementTypesControl={<button type="button">풀타임</button>}
        brief={[
          briefRow(1, null, "제품 의사결정 참여", "제품 논의부터 참여"),
          briefRow(2, "location", "선호 근무 지역", "서울 또는 원격"),
          briefRow(3, "next_scope", "다음 역할", "제품 엔지니어"),
        ]}
        memories={[]}
      />
    </MessagesProvider>
  );

  const labels = [
    "다음 역할",
    "근무 형태",
    "선호 근무 지역",
    "보상",
    "꼭 필요한 것",
    "피하고 싶은 것",
    "제품 의사결정 참여",
  ];
  const positions = labels.map((label) => html.indexOf(label));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((left, right) => left - right)
  );
  assert.equal(html.match(/빈칸/g)?.length, 3);
  assert.match(html, /다음 역할[\s\S]*제품 엔지니어/);
  assert.match(html, /선호 근무 지역[\s\S]*서울 또는 원격/);
  assert.match(html, /<dl[^>]*>[\s\S]*근무 형태[\s\S]*풀타임[\s\S]*<\/dl>/);
});

test("shows all five pinned fields as blank when the Brief is empty", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="en">
      <CareerTalentContextSection brief={[]} memories={[]} />
    </MessagesProvider>
  );

  assert.match(html, /Next role/);
  assert.match(html, /Location &amp; work style/);
  assert.match(html, /Compensation/);
  assert.match(html, /Deal-breakers/);
  assert.match(html, /Must-haves/);
  assert.equal(html.match(/Blank/g)?.length, 5);
});
