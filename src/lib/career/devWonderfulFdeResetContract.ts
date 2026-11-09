// Explicit fixture identities. Never expand a destructive scope by display name.
export const WONDERFUL_FDE_TEST_ACCOUNTS = [
  { id: "0c28e543-f525-4780-84eb-0152679cf530", email: "khj6051@optimizerai.xyz" },
  { id: "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd", email: "khj605123@gmail.com" },
  { id: "2c3a9d50-d392-4764-8bd1-6d9c036ddc87", email: "daniel@matchharper.com" },
] as const;

export function canResetWonderfulFde(user: { id: string; email?: string | null } | null) {
  return !!user && WONDERFUL_FDE_TEST_ACCOUNTS.some(
    (account) => account.id === user.id && account.email === user.email?.toLowerCase()
  );
}

export type WonderfulFdeResetPreview = {
  fingerprint: string;
  counts: { table: string; count: number }[];
  meetings: number;
  slackMessages: number;
  retainedSharedReplies: number;
};
