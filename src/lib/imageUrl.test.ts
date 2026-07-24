import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHarperPublicImageUrl } from "@/lib/imageUrl";

test("normalizes Harper public image URLs to local paths", () => {
  assert.equal(
    normalizeHarperPublicImageUrl(
      "https://matchharper.com/images/logo.png"
    ),
    "/images/logo.png"
  );
  assert.equal(
    normalizeHarperPublicImageUrl(
      "https://www.matchharper.com/images/logo.png?v=2"
    ),
    "/images/logo.png?v=2"
  );
});

test("preserves local and external image URLs", () => {
  assert.equal(
    normalizeHarperPublicImageUrl("/images/logo.png"),
    "/images/logo.png"
  );
  assert.equal(
    normalizeHarperPublicImageUrl("https://example.com/images/logo.png"),
    "https://example.com/images/logo.png"
  );
  assert.equal(
    normalizeHarperPublicImageUrl("https://matchharper.com/avatar/logo.png"),
    "https://matchharper.com/avatar/logo.png"
  );
});

test("returns null for empty image URLs", () => {
  assert.equal(normalizeHarperPublicImageUrl(null), null);
  assert.equal(normalizeHarperPublicImageUrl("  "), null);
});
