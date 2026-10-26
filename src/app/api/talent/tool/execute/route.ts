import { after, NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { executeCareerToolRequest } from "@/lib/career/phone/executeCareerToolRequest.server";

export async function POST(req: NextRequest) {
  return executeCareerToolRequest(req, {
    getUser: () => getRequestUser(req),
    scheduleAfter: (task) => after(task),
  });
}
