// Slack may redeliver events after a fresh local scenario has replaced its DB.
// Scope by transport timestamps, including the thread's original message.
export function belongsToLocalRound(body, startedAt) {
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;
  const timestamps = [body?.event?.ts, body?.event?.thread_ts,
    body?.message?.ts, body?.message?.thread_ts, body?.container?.message_ts]
    .filter(value => value != null);
  return timestamps.every(value => Number.isFinite(Number(value)) && Number(value) >= startedAt);
}
