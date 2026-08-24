throw new Error(
  "translation:push was removed because it overwrote every DB translation row. Use translation:plan and translation:sync; only code-source changes may be pushed."
);
