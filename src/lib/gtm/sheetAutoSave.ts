export type SheetAutoSaveFailure = {
  conflict: boolean;
  expectedVersion: number;
  name: string;
};

export function isHttpConflict(error: unknown) {
  if (!(error instanceof Error) || !("status" in error)) return false;
  return (error as Error & { status?: unknown }).status === 409;
}

export function isSheetAutoSaveBlocked(
  failure: SheetAutoSaveFailure | null,
  name: string,
  expectedVersion: number
) {
  if (!failure || failure.expectedVersion !== expectedVersion) return false;
  return failure.conflict || failure.name === name;
}
