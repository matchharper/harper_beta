import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";

type Reference = { id: string; element: HTMLElement; formIds: number[]; reveal: (formId: number) => void };
const Context = createContext<{
  latest: ReadonlyMap<number, Reference>;
  register: (previous: HTMLElement | null, reference: Reference | null) => void;
} | null>(null);

/** One editable location per form in the rendered conversation, including groups. */
export function CareerFormReferenceProvider({ children }: { children: ReactNode }) {
  const [references, setReferences] = useState<ReadonlyMap<HTMLElement, Reference>>(() => new Map());
  const register = useCallback((previous: HTMLElement | null, reference: Reference | null) => {
    setReferences(current => {
      const next = new Map(current);
      if (previous) next.delete(previous);
      if (reference) next.set(reference.element, reference);
      return next;
    });
  }, []);
  const latest = new Map<number, Reference>();
  for (const reference of references.values()) for (const formId of reference.formIds) {
    const prior = latest.get(formId);
    // History pagination can mount older references later. Use conversation
    // position, never component mount time, to choose the current location.
    if (!prior || prior.element.compareDocumentPosition(reference.element) & Node.DOCUMENT_POSITION_FOLLOWING)
      latest.set(formId, reference);
  }
  return <Context.Provider value={{ latest, register }}>{children}</Context.Provider>;
}

export function useCareerFormReference(formIds: number[], open: () => void) {
  const context = useContext(Context);
  const id = useId();
  const register = context?.register;
  const node = useRef<HTMLElement | null>(null);
  const key = formIds.join(",");
  const reveal = useCallback((formId: number) => {
    open();
    requestAnimationFrame(() => {
      const target = node.current?.querySelector<HTMLElement>(`[data-career-form-id="${formId}"]`) ?? node.current;
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, [open]);
  const ref = useCallback((element: HTMLElement | null) => {
    register?.(node.current, element ? { id, element, formIds: key.split(",").map(Number), reveal } : null);
    node.current = element;
  }, [register, id, key, reveal]);
  return {
    ref,
    owns: (formId: number) => !context?.latest.has(formId) || context.latest.get(formId)?.id === id,
    reveal: (formId: number) => context?.latest.get(formId)?.reveal(formId),
  };
}
