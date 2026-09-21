import assert from "node:assert/strict";
import test from "node:test";
import type { InfiniteData } from "@tanstack/react-query";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import {
  getLoadedHistoryFilterCount,
  getLoadedHistoryFilterPageOffset,
  mergeRefreshedHistoryFirstPage,
} from "@/hooks/career/careerHistoryPageCache";
import { OpportunityType } from "@/lib/opportunityType";

type TestPage = {
  items: CareerHistoryOpportunity[];
  nextOffset: number | null;
};

const createOpportunity = (
  id: string,
  feedback: CareerHistoryOpportunity["feedback"],
  savedStage: CareerHistoryOpportunity["savedStage"] = null
) =>
  ({
    feedback,
    id,
    isInternal: false,
    opportunityType: OpportunityType.ExternalJd,
    savedStage,
    sourceType: "external",
  }) as CareerHistoryOpportunity;

test("a latest-page refresh preserves saved cards held by the mixed first page", () => {
  const disappearingSavedCard = createOpportunity(
    "saved-only-in-first-page",
    "positive",
    "saved"
  );
  const cached = {
    pages: [
      {
        items: [createOpportunity("new-old", null), disappearingSavedCard],
        nextOffset: 10,
      },
      {
        items: [
          createOpportunity("saved-2", "positive", "saved"),
          createOpportunity("saved-3", "positive", "saved"),
          createOpportunity("saved-4", "positive", "saved"),
        ],
        nextOffset: null,
      },
    ],
    pageParams: [0, 0],
  } satisfies InfiniteData<TestPage, number>;

  const merged = mergeRefreshedHistoryFirstPage(cached, {
    items: [createOpportunity("new-latest", null)],
    nextOffset: null,
  });
  const ids = new Set(
    merged.pages.flatMap((page) => page.items.map(({ id }) => id))
  );

  assert.equal(ids.has(disappearingSavedCard.id), true);
  assert.equal(ids.size, 6);
});

test("a completed filter can restart from the loaded page boundary after counts grow", () => {
  const cached = {
    pages: [
      {
        items: [
          createOpportunity("saved-1", "positive", "saved"),
          createOpportunity("saved-2", "positive", "saved"),
          createOpportunity("saved-3", "positive", "saved"),
        ],
        nextOffset: null,
      },
    ],
    pageParams: [0],
  } satisfies InfiniteData<TestPage, number>;

  assert.equal(
    getLoadedHistoryFilterCount(cached, {
      historyTab: "saved",
      savedStage: "saved",
    }),
    3
  );
  assert.equal(
    getLoadedHistoryFilterPageOffset(
      cached,
      { historyTab: "saved", savedStage: "saved" },
      10
    ),
    0
  );
});
