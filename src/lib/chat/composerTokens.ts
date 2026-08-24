export type ChatComposerToken<TData = unknown> = {
  data: TData;
  end: number;
  id: string;
  start: number;
  text: string;
};

export type ChatComposerTokenSegment<TData = unknown> =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "token";
      text: string;
      token: ChatComposerToken<TData>;
    };

function sortTokens<TData>(tokens: ChatComposerToken<TData>[]) {
  return [...tokens].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
}

export function reconcileChatComposerTokens<TData>(args: {
  nextValue: string;
  previousValue: string;
  tokens: ChatComposerToken<TData>[];
}) {
  if (args.nextValue === args.previousValue) return args.tokens;

  const shortestLength = Math.min(
    args.previousValue.length,
    args.nextValue.length
  );
  let editStart = 0;
  while (
    editStart < shortestLength &&
    args.previousValue[editStart] === args.nextValue[editStart]
  ) {
    editStart += 1;
  }

  let sharedSuffixLength = 0;
  while (
    sharedSuffixLength < shortestLength - editStart &&
    args.previousValue[args.previousValue.length - 1 - sharedSuffixLength] ===
      args.nextValue[args.nextValue.length - 1 - sharedSuffixLength]
  ) {
    sharedSuffixLength += 1;
  }

  const previousEditEnd = args.previousValue.length - sharedSuffixLength;
  const nextEditEnd = args.nextValue.length - sharedSuffixLength;
  const offset = nextEditEnd - previousEditEnd;

  return sortTokens(
    args.tokens.flatMap((token) => {
      if (token.end <= editStart) return [token];
      if (token.start >= previousEditEnd) {
        return [
          {
            ...token,
            end: token.end + offset,
            start: token.start + offset,
          },
        ];
      }
      return [];
    })
  );
}

export function addChatComposerToken<TData>(args: {
  data: TData;
  end: number;
  id: string;
  nextValue: string;
  previousValue: string;
  start: number;
  text: string;
  tokens: ChatComposerToken<TData>[];
}) {
  return sortTokens([
    ...reconcileChatComposerTokens({
      nextValue: args.nextValue,
      previousValue: args.previousValue,
      tokens: args.tokens,
    }),
    {
      data: args.data,
      end: args.end,
      id: args.id,
      start: args.start,
      text: args.text,
    },
  ]);
}

export function splitChatComposerTokenText<TData>(
  value: string,
  tokens: ChatComposerToken<TData>[]
): ChatComposerTokenSegment<TData>[] {
  const segments: ChatComposerTokenSegment<TData>[] = [];
  let previousEnd = 0;

  for (const token of sortTokens(tokens)) {
    if (
      token.start < previousEnd ||
      token.end > value.length ||
      value.slice(token.start, token.end) !== token.text
    ) {
      continue;
    }
    if (token.start > previousEnd) {
      segments.push({
        kind: "text",
        text: value.slice(previousEnd, token.start),
      });
    }
    segments.push({ kind: "token", text: token.text, token });
    previousEnd = token.end;
  }

  if (previousEnd < value.length) {
    segments.push({ kind: "text", text: value.slice(previousEnd) });
  }
  return segments;
}

export function normalizeChatComposerTokenSelection<TData>(args: {
  end: number;
  start: number;
  tokens: ChatComposerToken<TData>[];
}) {
  if (args.start === args.end) {
    const token = args.tokens.find(
      (item) => item.start < args.start && args.start < item.end
    );
    if (!token) return { end: args.end, start: args.start };
    const cursor =
      args.start - token.start <= token.end - args.start
        ? token.start
        : token.end;
    return { end: cursor, start: cursor };
  }

  let start = Math.min(args.start, args.end);
  let end = Math.max(args.start, args.end);
  let changed = true;
  while (changed) {
    changed = false;
    for (const token of args.tokens) {
      if (start < token.end && end > token.start) {
        const nextStart = Math.min(start, token.start);
        const nextEnd = Math.max(end, token.end);
        changed = changed || nextStart !== start || nextEnd !== end;
        start = nextStart;
        end = nextEnd;
      }
    }
  }
  return { end, start };
}

export function getChatComposerTokenKeyboardAction<TData>(args: {
  end: number;
  key: string;
  start: number;
  tokens: ChatComposerToken<TData>[];
}):
  | { kind: "delete"; end: number; start: number }
  | { kind: "move"; cursor: number }
  | null {
  if (args.start !== args.end) {
    if (args.key !== "Backspace" && args.key !== "Delete") return null;
    const selection = normalizeChatComposerTokenSelection(args);
    const intersectsToken = args.tokens.some(
      (token) => selection.start < token.end && selection.end > token.start
    );
    return intersectsToken
      ? { kind: "delete", end: selection.end, start: selection.start }
      : null;
  }

  const cursor = args.start;
  if (args.key === "ArrowLeft") {
    const token = args.tokens.find(
      (item) => item.start < cursor && cursor <= item.end
    );
    return token ? { kind: "move", cursor: token.start } : null;
  }
  if (args.key === "ArrowRight") {
    const token = args.tokens.find(
      (item) => item.start <= cursor && cursor < item.end
    );
    return token ? { kind: "move", cursor: token.end } : null;
  }
  if (args.key === "Backspace") {
    const token = args.tokens.find(
      (item) => item.start < cursor && cursor <= item.end
    );
    return token
      ? { kind: "delete", end: token.end, start: token.start }
      : null;
  }
  if (args.key === "Delete") {
    const token = args.tokens.find(
      (item) => item.start <= cursor && cursor < item.end
    );
    return token
      ? { kind: "delete", end: token.end, start: token.start }
      : null;
  }
  return null;
}
