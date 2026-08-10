import type { FocusEvent, PointerEvent } from "react";

const ORG_EDITING_INTERACTION_SELECTOR =
  "[data-inline-editable-interaction], [data-org-unsaved-changes-bar]";

function isOrgEditingInteraction(target: EventTarget | null) {
  return Boolean(
    target &&
    typeof (target as Element).closest === "function" &&
    (target as Element).closest(ORG_EDITING_INTERACTION_SELECTOR)
  );
}

export function createOrgEditingDismissHandlers<
  T extends HTMLElement = HTMLDivElement,
>({
  active,
  hasChanges,
  onDismiss,
  pending,
}: {
  active: boolean;
  hasChanges: boolean;
  onDismiss: () => void;
  pending: boolean;
}) {
  const dismissIfUnchanged = () => {
    if (!active || hasChanges || pending) return;
    onDismiss();
  };

  return {
    onBlurCapture: (event: FocusEvent<T>) => {
      if (isOrgEditingInteraction(event.relatedTarget)) return;
      dismissIfUnchanged();
    },
    onPointerDownCapture: (event: PointerEvent<T>) => {
      if (isOrgEditingInteraction(event.target)) return;
      dismissIfUnchanged();
    },
  };
}
