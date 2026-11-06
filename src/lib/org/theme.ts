/**
 * The company workspace uses the candidate side's sky theme
 * (src/styles/career-floating-sky.css): one canvas, glass cards, pill buttons.
 * Turn it off here to go back to the plain company look everywhere.
 */
export const ORG_WORKSPACE_THEME: "sky" | null = "sky";

/** Props for the element that wraps a company screen (the shell, its loading state). */
export function orgWorkspaceThemeProps(): {
  className?: string;
  "data-harper-theme"?: "sky";
} {
  return ORG_WORKSPACE_THEME === "sky"
    ? { className: "career-sky-canvas", "data-harper-theme": "sky" }
    : {};
}

/** True when the company screens use the candidate side's frame and theme. */
export function orgUsesSkyTheme() {
  return ORG_WORKSPACE_THEME === "sky";
}
