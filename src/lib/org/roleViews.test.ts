import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOrgBoardPositions,
  normalizeOrgBoardText,
  normalizeOrgBoardViewport,
  orgBoardTextSizeForZoom,
} from "./roleViews";

test("a board text box keeps its place, words and an offered size", () => {
  assert.deepEqual(
    normalizeOrgBoardText({
      id: "t1",
      size: 30,
      text: "1차 검토 끝",
      x: 5,
      y: 6,
    }),
    // A size between the offered ones snaps to the closest.
    { id: "t1", size: 32, text: "1차 검토 끝", x: 5, y: 6 }
  );
  // Nothing written, or no place on the board: not a box.
  assert.equal(
    normalizeOrgBoardText({ id: "t2", text: "  ", x: 0, y: 0 }),
    null
  );
  assert.equal(normalizeOrgBoardText({ id: "t3", text: "메모" }), null);
});

test("card spots and a view keep only usable numbers", () => {
  assert.deepEqual(
    normalizeOrgBoardPositions({ rec1: { x: 10, y: 20 }, broken: { x: "a" } }),
    { rec1: { x: 10, y: 20 } }
  );
  assert.deepEqual(normalizeOrgBoardViewport({ x: 1, y: 2, zoom: 0.5 }), {
    x: 1,
    y: 2,
    zoom: 0.5,
  });
  assert.equal(normalizeOrgBoardViewport({ x: 1, y: 2 }), null);
});

test("a new text box reads the same on screen at any zoom", () => {
  assert.equal(orgBoardTextSizeForZoom(1), 18);
  assert.equal(orgBoardTextSizeForZoom(0.2), 96);
  assert.equal(orgBoardTextSizeForZoom(2), 14);
});
