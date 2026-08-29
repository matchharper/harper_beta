import { googleCalendarHandlers } from "@/lib/integrations/googleCalendarServer";

export const runtime = "nodejs";
export const POST = googleCalendarHandlers.connect;
