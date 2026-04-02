export type RequestAccessReviewStatus =
  | "pending"
  | "approved"
  | "already_granted";

export type RequestAccessApprovalEmailLocale = "en" | "ko";

export type RequestAccessApprovalEmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type RequestAccessApprovalSendStatus =
  | "approved"
  | "already_granted"
  | "failed";

export type RequestAccessApprovalDraft = {
  status: RequestAccessReviewStatus;
  email: string;
  name: string | null;
  company: string | null;
  role: string | null;
  hiringNeed: string | null;
  accessGrantedAt: string | null;
  activationUrl: string;
  locale: RequestAccessApprovalEmailLocale;
  templates: Record<
    RequestAccessApprovalEmailLocale,
    RequestAccessApprovalEmailTemplate
  >;
  from: string;
  subject: string;
  html: string;
  text: string;
};

export type RequestAccessReviewQueueItem = {
  accessGrantedAt: string | null;
  approvalEmailSentAt: string | null;
  approvedAt: string | null;
  company: string | null;
  createdAt: string;
  email: string;
  hiringNeed: string | null;
  name: string | null;
  requestToken: string;
  reviewUrl: string;
  role: string | null;
  status: RequestAccessReviewStatus;
  userId: string | null;
};

export type RequestAccessReviewQueueResponse = {
  counts: {
    alreadyGranted: number;
    approved: number;
    pending: number;
    total: number;
  };
  items: RequestAccessReviewQueueItem[];
};

export type RequestAccessBulkApprovalResult = {
  email: string;
  error?: string;
  status: RequestAccessApprovalSendStatus;
};

export type RequestAccessBulkApprovalResponse = {
  counts: {
    alreadyGranted: number;
    approved: number;
    failed: number;
    total: number;
  };
  ok: boolean;
  results: RequestAccessBulkApprovalResult[];
};
