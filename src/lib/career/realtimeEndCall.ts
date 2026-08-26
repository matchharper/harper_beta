export function shouldSpeakRealtimeEndCallFallback(args: {
  endCallRequested: boolean;
  responseText: string;
}) {
  return args.endCallRequested && !args.responseText.trim();
}
