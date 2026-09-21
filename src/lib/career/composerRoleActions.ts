export const shouldShowCareerComposerRoleActions = (draft: string) =>
  Array.from(draft.trim()).length < 2;
