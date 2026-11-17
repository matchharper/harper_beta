import { handleCallback } from "@vercel/queue";

// Acknowledge jobs queued by older clients without starting another mailbox read.
const acknowledge = handleCallback(async () => {});

export async function POST(request: Request) {
  return acknowledge(request);
}
