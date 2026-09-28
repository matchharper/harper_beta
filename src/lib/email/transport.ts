// A local transport never receives a live Resend credential. The relay owns
// recipient allowlisting and durable mailbox storage before any external send.
export function resendApiUrl(path: string) {
  if (process.env.HARPER_LOCAL_E2E !== "1") return `https://api.resend.com${path}`;
  const url = new URL(process.env.HARPER_LOCAL_MAIL_URL || "missing:");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Local mail requires a loopback transport");
  }
  return `${url.origin}${path}`;
}
