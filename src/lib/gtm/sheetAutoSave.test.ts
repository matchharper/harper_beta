import assert from "node:assert/strict";
import test from "node:test";
import {
  isHttpConflict,
  isSheetAutoSaveBlocked,
  type SheetAutoSaveFailure,
} from "./sheetAutoSave";

test("blocks the failed sheet auto-save until the input changes", () => {
  const failure: SheetAutoSaveFailure = {
    conflict: false,
    expectedVersion: 4,
    name: "Creator Directory",
  };

  assert.equal(isSheetAutoSaveBlocked(failure, "Creator Directory", 4), true);
  assert.equal(isSheetAutoSaveBlocked(failure, "Connected Creators", 4), false);
});

test("keeps a version conflict blocked across edits", () => {
  const failure: SheetAutoSaveFailure = {
    conflict: true,
    expectedVersion: 4,
    name: "Creator Directory",
  };

  assert.equal(isSheetAutoSaveBlocked(failure, "Connected Creators", 4), true);
  assert.equal(isSheetAutoSaveBlocked(failure, "Connected Creators", 5), false);
});

test("recognizes the API conflict status without parsing its message", () => {
  assert.equal(
    isHttpConflict(Object.assign(new Error("conflict"), { status: 409 })),
    true
  );
  assert.equal(
    isHttpConflict(Object.assign(new Error("failed"), { status: 500 })),
    false
  );
  assert.equal(isHttpConflict(new Error("conflict")), false);
});
