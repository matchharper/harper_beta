import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addChatComposerToken,
  type ChatComposerToken,
  getChatComposerTokenKeyboardAction,
  normalizeChatComposerTokenSelection,
  reconcileChatComposerTokens,
  splitChatComposerTokenText,
} from "@/lib/chat/composerTokens";

type TokenInsertion<TData> = {
  cursor: number;
  data: TData;
  end: number;
  id: string;
  start: number;
  text: string;
  value: string;
};

export function useChatComposerTokens<TData>(args: {
  onValueChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
}) {
  const { onValueChange, textareaRef, value } = args;
  const [tokens, setTokenState] = useState<ChatComposerToken<TData>[]>([]);
  const tokensRef = useRef(tokens);
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  }, [value]);

  const replaceTokens = useCallback(
    (nextTokens: ChatComposerToken<TData>[]) => {
      tokensRef.current = nextTokens;
      setTokenState(nextTokens);
    },
    []
  );

  const placeCursor = useCallback(
    (cursor: number) => {
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(cursor, cursor);
      });
    },
    [textareaRef]
  );

  const commitValue = useCallback(
    (nextValue: string, nextTokens: ChatComposerToken<TData>[]) => {
      valueRef.current = nextValue;
      replaceTokens(nextTokens);
      onValueChange(nextValue);
    },
    [onValueChange, replaceTokens]
  );

  const insertToken = useCallback(
    (insertion: TokenInsertion<TData>) => {
      const nextTokens = addChatComposerToken({
        data: insertion.data,
        end: insertion.end,
        id: insertion.id,
        nextValue: insertion.value,
        previousValue: valueRef.current,
        start: insertion.start,
        text: insertion.text,
        tokens: tokensRef.current,
      });
      commitValue(insertion.value, nextTokens);
      placeCursor(insertion.cursor);
    },
    [commitValue, placeCursor]
  );

  const updateValue = useCallback(
    (nextValue: string) => {
      const nextTokens = reconcileChatComposerTokens({
        nextValue,
        previousValue: valueRef.current,
        tokens: tokensRef.current,
      });
      commitValue(nextValue, nextTokens);
    },
    [commitValue]
  );
  const handleChange = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      updateValue(event.currentTarget.value);
    },
    [updateValue]
  );

  const deleteRange = useCallback(
    (start: number, end: number) => {
      const currentValue = valueRef.current;
      const nextValue = `${currentValue.slice(0, start)}${currentValue.slice(end)}`;
      const nextTokens = reconcileChatComposerTokens({
        nextValue,
        previousValue: currentValue,
        tokens: tokensRef.current,
      });
      commitValue(nextValue, nextTokens);
      placeCursor(start);
    },
    [commitValue, placeCursor]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return false;
      const action = getChatComposerTokenKeyboardAction({
        end: event.currentTarget.selectionEnd ?? 0,
        key: event.key,
        start: event.currentTarget.selectionStart ?? 0,
        tokens: tokensRef.current,
      });
      if (!action) return false;
      event.preventDefault();
      if (action.kind === "move") {
        event.currentTarget.setSelectionRange(action.cursor, action.cursor);
      } else {
        deleteRange(action.start, action.end);
      }
      return true;
    },
    [deleteRange]
  );

  const handleBeforeInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      const inputType = (event.nativeEvent as InputEvent).inputType;
      const key =
        inputType === "deleteContentBackward"
          ? "Backspace"
          : inputType === "deleteContentForward"
            ? "Delete"
            : null;
      if (key) {
        const action = getChatComposerTokenKeyboardAction({
          end: event.currentTarget.selectionEnd ?? 0,
          key,
          start: event.currentTarget.selectionStart ?? 0,
          tokens: tokensRef.current,
        });
        if (action?.kind === "delete") {
          event.preventDefault();
          deleteRange(action.start, action.end);
          return;
        }
      }

      const selection = normalizeChatComposerTokenSelection({
        end: event.currentTarget.selectionEnd ?? 0,
        start: event.currentTarget.selectionStart ?? 0,
        tokens: tokensRef.current,
      });
      event.currentTarget.setSelectionRange(selection.start, selection.end);
    },
    [deleteRange]
  );

  const handleSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      const textarea = event.currentTarget;
      const selection = normalizeChatComposerTokenSelection({
        end: textarea.selectionEnd ?? 0,
        start: textarea.selectionStart ?? 0,
        tokens: tokensRef.current,
      });
      if (
        selection.start === textarea.selectionStart &&
        selection.end === textarea.selectionEnd
      ) {
        return;
      }
      textarea.setSelectionRange(selection.start, selection.end);
    },
    []
  );

  const resetTokens = useCallback(() => replaceTokens([]), [replaceTokens]);
  const segments = useMemo(
    () => splitChatComposerTokenText(value, tokens),
    [tokens, value]
  );

  return {
    handleBeforeInput,
    handleChange,
    handleKeyDown,
    handleSelect,
    insertToken,
    replaceTokens,
    resetTokens,
    segments,
    tokens,
    updateValue,
  };
}
