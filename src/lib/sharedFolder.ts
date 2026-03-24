export type SharedFolderViewerIdentity = {
  viewerKey: string;
  viewerName: string;
};

export type SharedFolderCandidateNote = {
  id: number;
  candidId: string;
  memo: string;
  viewerName: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

export function formatSharedFolderNoteDate(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function createDefaultSharedFolderViewerName(viewerKey: string) {
  return `게스트 ${viewerKey.slice(0, 4).toUpperCase()}`;
}
