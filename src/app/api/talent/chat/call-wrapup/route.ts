import { after, NextRequest } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { wrapupCareerCallRequest } from "@/lib/career/phone/wrapupCareerCallRequest.server";

export async function POST(req: NextRequest) {
  return wrapupCareerCallRequest(req, {
    getUser: () => getRequestUser(req),
    scheduleAfter: (task) => after(task),
  });
}
