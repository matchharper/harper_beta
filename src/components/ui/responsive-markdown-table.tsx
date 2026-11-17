import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ExtraProps } from "react-markdown";
import { cn } from "@/lib/utils";

type Element = NonNullable<ExtraProps["node"]>;
type ElementContent = Element["children"][number];

const CellHeaders = createContext<ReadonlyMap<Element, string>>(new Map());
const elements = (node: Element | undefined) =>
  node?.children.filter(
    (child): child is Element => child.type === "element"
  ) ?? [];
const text = (node: ElementContent): string =>
  node.type === "text"
    ? node.value
    : node.type === "element"
      ? node.children.map(text).join("")
      : "";

/** Preserve one semantic table and its content; repeat column labels in the
 * stacked mobile layout so comparisons remain readable without clipped cells. */
export function ResponsiveMarkdownTable({
  node,
  children,
}: {
  node?: Element;
  children: ReactNode;
}) {
  const sections = elements(node);
  const headers = elements(
    elements(sections.find((section) => section.tagName === "thead"))[0]
  ).map(text);
  const labels = new Map<Element, string>();
  for (const row of elements(
    sections.find((section) => section.tagName === "tbody")
  )) {
    elements(row).forEach((cell, index) =>
      labels.set(cell, headers[index] ?? "")
    );
  }
  return (
    <CellHeaders.Provider value={labels}>
      <div className="mt-4 first:mt-0" data-rich-text-table="true">
        <table
          role="table"
          className="block w-full border-collapse text-left text-sm leading-6 text-neutral-primary sm:table [&_thead]:sr-only sm:[&_thead]:not-sr-only sm:[&_thead]:table-header-group [&_tbody]:block sm:[&_tbody]:table-row-group [&_tbody>tr]:block [&_tbody>tr]:border-b [&_tbody>tr]:border-stroke-subtle [&_tbody>tr]:py-3 sm:[&_tbody>tr]:table-row sm:[&_tbody>tr]:py-0 [&_td>div]:min-w-0 [&_td>div]:max-w-none"
        >
          {children}
        </table>
      </div>
    </CellHeaders.Provider>
  );
}

export function ResponsiveMarkdownCell({
  node,
  children,
  className,
  style,
}: {
  node?: Element;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const label = useContext(CellHeaders).get(node!);
  return (
    <td
      style={style}
      className={cn(
        className,
        "block min-w-0 max-w-none border-0 px-0 py-2 sm:table-cell sm:max-w-72 sm:border-b sm:px-3 sm:py-3"
      )}
    >
      {label ? (
        <span className="mb-1 block text-xs text-neutral-muted sm:hidden">
          {label}
        </span>
      ) : null}
      {children}
    </td>
  );
}
