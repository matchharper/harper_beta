import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Keep semantic appearance utilities in their Tailwind property groups. Without
// this, bg-card-image erases bg-card and font-button erases font-sans.
const surfaces = [
  "surface",
  "card",
  "opportunity",
  "modal",
  "menu",
  "popover",
  "control",
  "button",
  "composer",
];
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: [
        ...surfaces,
        "sheet",
        "pill",
        "menu-item",
        "checkbox",
        "composer-collapsed",
        "message",
        "message-tail",
        "tab-list",
        "tab",
        "badge",
        "tooltip",
        "toast",
      ],
      shadow: [
        ...surfaces,
        "message",
        "tab-selected",
        "tooltip",
        "toast",
        "switch-thumb",
        "badge",
        "tab-list",
        "panel-slide",
        "marketing-glow",
        "inset-highlight",
        "outline",
        "dock",
      ],
      blur: [
        ...surfaces,
        "overlay",
        "message",
        "tooltip",
        "toast",
        "badge",
        "tab-list",
      ],
      "font-weight": [
        "regular",
        "book",
        "book-medium",
        "body",
        "heading",
        "label",
        "control",
        "button",
        "composer",
        "tab",
        "badge",
      ],
    },
    classGroups: {
      "bg-image": [
        {
          bg: [
            ...surfaces.map((name) => `${name}-image`),
            "toast-image",
            "composer-fade",
            "workspace-image",
            "gradblack",
            "gradpastel",
            "gradpastel2",
            "call-orb",
            "photo-scrim",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
