import assert from "node:assert/strict";
import test from "node:test";
import { resolveTalentLocation } from "./talentLocation";

test("candidate-maintained location wins over signup current_location", () => {
  assert.equal(
    resolveTalentLocation({
      current_location: "South Korea",
      location: "San Francisco, USA",
    }),
    "San Francisco, USA"
  );
});

test("signup location is used only when location is empty", () => {
  assert.equal(
    resolveTalentLocation({ currentLocation: "Seoul", location: "  " }),
    "Seoul"
  );
  assert.equal(resolveTalentLocation({ location: null }), null);
});
