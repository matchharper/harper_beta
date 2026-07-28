import assert from "node:assert/strict";
import test from "node:test";
import {
  getDisplayableProfileImageUrl,
  normalizeHarperPublicImageUrl,
} from "@/lib/imageUrl";

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

test("filters expired LinkedIn profile image URLs", () => {
  const nowMs = Date.UTC(2026, 6, 28);

  assert.equal(
    getDisplayableProfileImageUrl(
      "https://media.licdn.com/dms/image/test?e=1784764800&v=beta&t=signed",
      nowMs
    ),
    null
  );
  assert.equal(
    getDisplayableProfileImageUrl(
      "https://media.licdn.com/dms/image/test?e=1785283201&v=beta&t=signed",
      nowMs
    ),
    "https://media.licdn.com/dms/image/test?e=1785283201&v=beta&t=signed"
  );
});

test("preserves non-expiring profile image URLs", () => {
  assert.equal(
    getDisplayableProfileImageUrl(
      "https://lh3.googleusercontent.com/a/profile-photo"
    ),
    "https://lh3.googleusercontent.com/a/profile-photo"
  );
  assert.equal(getDisplayableProfileImageUrl(null), null);
});
