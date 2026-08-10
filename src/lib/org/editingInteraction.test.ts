import assert from "node:assert/strict";
import test from "node:test";
import type { FocusEvent, PointerEvent } from "react";
import { createOrgEditingDismissHandlers } from "./editingInteraction";

const outsideTarget = {
  closest: () => null,
} as unknown as EventTarget;
const editingTarget = {
  closest: () => ({}),
} as unknown as EventTarget;

test("dismisses unchanged editing when an outside surface is pressed", () => {
  let dismissCount = 0;
  const handlers = createOrgEditingDismissHandlers({
    active: true,
    hasChanges: false,
    onDismiss: () => {
      dismissCount += 1;
    },
    pending: false,
  });

  handlers.onPointerDownCapture({
    target: outsideTarget,
  } as PointerEvent<HTMLDivElement>);

  assert.equal(dismissCount, 1);
});

test("keeps editing for inline fields and the unsaved-changes bar", () => {
  let dismissCount = 0;
  const handlers = createOrgEditingDismissHandlers({
    active: true,
    hasChanges: false,
    onDismiss: () => {
      dismissCount += 1;
    },
    pending: false,
  });

  handlers.onPointerDownCapture({
    target: editingTarget,
  } as PointerEvent<HTMLDivElement>);
  handlers.onBlurCapture({
    relatedTarget: editingTarget,
  } as FocusEvent<HTMLDivElement>);

  assert.equal(dismissCount, 0);
});

test("keeps editing when there are changes or a save is pending", () => {
  let dismissCount = 0;
  const onDismiss = () => {
    dismissCount += 1;
  };

  createOrgEditingDismissHandlers({
    active: true,
    hasChanges: true,
    onDismiss,
    pending: false,
  }).onPointerDownCapture({
    target: outsideTarget,
  } as PointerEvent<HTMLDivElement>);
  createOrgEditingDismissHandlers({
    active: true,
    hasChanges: false,
    onDismiss,
    pending: true,
  }).onPointerDownCapture({
    target: outsideTarget,
  } as PointerEvent<HTMLDivElement>);

  assert.equal(dismissCount, 0);
});
