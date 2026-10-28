import { Ticket as TicketIcon } from "lucide-react";

export function Ticket({ size = 16 }: { size?: number }) {
  return (
    <TicketIcon
      size={size}
      className="shrink-0 rotate-45 text-positive"
      fill="currentColor"
      aria-hidden="true"
    />
  );
}
