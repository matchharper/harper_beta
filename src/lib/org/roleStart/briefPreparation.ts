type BriefWriter = "signals" | "summary";

/** Join existing writers through their final Brief save before taking a search snapshot. */
export async function completeBriefPreparation(args: {
  isWriting: (writer: BriefWriter) => Promise<boolean>;
  refreshSignals: () => Promise<unknown>;
  refreshSummary: () => Promise<unknown>;
  wait?: () => Promise<void>;
}) {
  const wait = args.wait ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 500)));
  const writers = [
    ["signals", args.refreshSignals],
    ["summary", args.refreshSummary],
  ] as const;
  for (const [writer, refresh] of writers) {
    while (await args.isWriting(writer)) await wait();
    await refresh();
    // Another process can claim the lease between the check and refresh. A
    // fresh session alone is insufficient: its canonical Brief save follows it.
    while (await args.isWriting(writer)) await wait();
  }
}
