import "server-only";

import { applicantListSource } from "./applicantList";
import { APPLICANT_FILE_MAX_BYTES, ApplicantSheetError, parseApplicantSheet, type ApplicantSheet } from "./applicantSheet";
import { importApplicantPeople } from "./import.server";
import { writeRunUpload } from "./store.server";
import { AgentActionError } from "./views.server";

export type ApplicantFileImport = {
  fileName: string;
  /** Everyone in the file (rows under the header with any value). */
  rows: number;
  /** People added to #5 now (an import run), and those #5 already had. */
  newPeople: number;
  alreadyKnown: number;
  /** The same person twice in the file. */
  duplicates: number;
  /** Of the new people: with an email, and without one (profile URL only). */
  withEmail: number;
  withoutEmail: number;
  /** A company's list: people without an email, left out. */
  noEmail: number;
  /** False when the file has no email column at all (only profile URLs). */
  hasEmailColumn: boolean;
  recognisedHeaders: ApplicantSheet["recognisedHeaders"];
  unknownHeaders: string[];
  /** Rows left out (no email and no profile URL, or over the limit), with the sheet's row number. */
  skipped: ApplicantSheet["skipped"];
  runId: string | null;
};

/**
 * #5: a LinkedIn Recruiter applicant export dropped on /ops ("Apply starters" → Export all to XLSX, or a CSV) → an
 * import run of the people #5 has not seen. A file that cannot be read fails with a plain message for the screen
 * (AgentActionError, which the route shows as is).
 */
export async function importApplicantFile(args: {
  fileName: string; bytes: Uint8Array; isTest: boolean; userId: string; listCompany?: string;
}): Promise<ApplicantFileImport> {
  const listCompany = args.listCompany?.trim() ?? "";
  const source = listCompany ? applicantListSource(listCompany) : "linkedin";
  if (!source) throw new AgentActionError("회사 이름은 영문으로 써 주세요(예: Acme).");
  if (args.bytes.length > APPLICANT_FILE_MAX_BYTES) {
    throw new AgentActionError(`파일이 너무 커요. ${Math.round(APPLICANT_FILE_MAX_BYTES / 1024 / 1024)}MB까지 올릴 수 있어요.`);
  }
  let sheet: ApplicantSheet;
  try {
    sheet = parseApplicantSheet(args.bytes);
  } catch (error) {
    if (error instanceof ApplicantSheetError) throw new AgentActionError(error.message);
    throw error;
  }
  if (!sheet.headerRow) {
    const found = sheet.unknownHeaders.slice(0, 8).join(", ");
    throw new AgentActionError(`이름·이메일·프로필 URL 열을 찾지 못했어요.${found ? ` 파일 첫 줄: ${found}` : ""}`);
  }
  const result = await importApplicantPeople(sheet.rows, { isTest: args.isTest, userId: args.userId, source });
  if (result.runId) {
    // The 검색 기록 line of the upload: the file and what it brought (a lost note never fails the upload).
    await writeRunUpload(result.runId, {
      fileName: args.fileName.slice(0, 200), rows: sheet.totalRows, newPeople: result.added, alreadyKnown: result.alreadyKnown,
      withEmail: result.addedWithEmail, at: new Date().toISOString(),
    }).catch((error) => console.warn("[gtm-agent] upload note", error instanceof Error ? error.message : String(error)));
  }
  return {
    fileName: args.fileName,
    rows: sheet.totalRows,
    newPeople: result.added,
    alreadyKnown: result.alreadyKnown,
    duplicates: result.duplicates,
    withEmail: result.addedWithEmail,
    withoutEmail: result.added - result.addedWithEmail,
    noEmail: result.noEmail,
    hasEmailColumn: sheet.recognisedHeaders.some((item) => item.field === "email"),
    recognisedHeaders: sheet.recognisedHeaders,
    unknownHeaders: sheet.unknownHeaders,
    skipped: sheet.skipped,
    runId: result.runId,
  };
}
