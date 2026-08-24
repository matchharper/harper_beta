/**
 * Vercel's 4.5 MB request limit includes multipart boundaries and form fields,
 * so keep the file itself at 4 MiB or below.
 */
export const MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_TALENT_DOCUMENT_FILE_SIZE_LABEL = "4 MB";
