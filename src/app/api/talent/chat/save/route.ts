import { after, NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { saveCareerTurnRequest } from "@/lib/career/phone/saveCareerTurnRequest.server";

export async function POST(req: NextRequest) {
  return saveCareerTurnRequest(req, {
    getUser: () => getRequestUser(req),
    scheduleAfter: (task) => after(task),
  });
}
