export function decodeGmailNotification(data: string | undefined) {
  if (!data) throw new Error("Missing Pub/Sub message data");
  const decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as {
    emailAddress?: unknown;
    historyId?: unknown;
  };
  const emailAddress =
    typeof decoded.emailAddress === "string"
      ? decoded.emailAddress.trim().toLowerCase()
      : "";
  const historyId =
    typeof decoded.historyId === "string"
      ? decoded.historyId.trim()
      : typeof decoded.historyId === "number" &&
          Number.isSafeInteger(decoded.historyId)
        ? String(decoded.historyId)
        : "";
  if (!emailAddress || !/^\d+$/.test(historyId))
    throw new Error("Invalid Gmail notification payload");
  return { emailAddress, historyId };
}
