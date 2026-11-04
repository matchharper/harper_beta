import assert from "node:assert/strict";
import test from "node:test";
import { cn } from "./cn";
import { cn as legacyCn } from "./utils";

test("semantic backgrounds and background images coexist", () => {
  assert.equal(cn("bg-card bg-card-image"), "bg-card bg-card-image");
  assert.equal(
    cn("bg-card bg-card-image", "bg-modal bg-modal-image"),
    "bg-modal bg-modal-image"
  );
});

test("caller appearance overrides replace their semantic property", () => {
  assert.equal(
    cn(
      "rounded-card shadow-(--shadow-card) backdrop-blur-card",
      "rounded-none shadow-none backdrop-blur-none"
    ),
    "rounded-none shadow-none backdrop-blur-none"
  );
  assert.equal(
    cn("font-sans font-button", "font-medium"),
    "font-sans font-medium"
  );
  assert.equal(
    cn(
      "border-(length:--card-border-width) border-card-border",
      "border-0 border-transparent"
    ),
    "border-0 border-transparent"
  );
});

test("state and responsive overrides stay independent", () => {
  assert.equal(
    cn(
      "rounded-modal md:rounded-modal hover:bg-button",
      "md:rounded-none hover:bg-button-hover"
    ),
    "rounded-modal md:rounded-none hover:bg-button-hover"
  );
});

test("both cn entry points share the same token-aware merger", () => {
  assert.equal(legacyCn, cn);
});
