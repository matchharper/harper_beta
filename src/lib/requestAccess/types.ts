export type RequestAccessReviewStatus =
  | "pending"
  | "approved"
  | "already_granted";

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
