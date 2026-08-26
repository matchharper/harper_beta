import { googleCalendarHandlers } from "@/lib/integrations/googleCalendarServer";

export const runtime = "nodejs";
export const GET = googleCalendarHandlers.GET;
export const DELETE = googleCalendarHandlers.DELETE;
