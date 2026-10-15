import type { ComponentProps } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Shared table surface for Members, Teams, Slots usage and Billing invoices. */
export function OrgTable({
  className,
  ...props
}: ComponentProps<typeof Table>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/8">
      <Table className={className} {...props} />
    </div>
  );
}
export const OrgTableBody = TableBody;
export function OrgTableHeader({
  className,
  ...props
}: ComponentProps<typeof TableHeader>) {
  return (
    <TableHeader
      className={cn("bg-black/5 border-b border-black/8", className)}
      {...props}
    />
  );
}
export function OrgTableRow({
  className,
  ...props
}: ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      className={cn("border-black/0 hover:bg-transparent", className)}
      {...props}
    />
  );
}
export function OrgTableHead({
  className,
  ...props
}: ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      scope="col"
      className={cn(
        "py-2 whitespace-nowrap px-4 text-[13px] font-normal",
        className
      )}
      {...props}
    />
  );
}
export function OrgTableCell({
  className,
  ...props
}: ComponentProps<typeof TableCell>) {
  return (
    <TableCell className={cn("px-4 py-2 text-[13px]", className)} {...props} />
  );
}
