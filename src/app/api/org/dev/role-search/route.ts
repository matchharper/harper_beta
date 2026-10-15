import { NextRequest } from "next/server";
import { handleDevRoleSearch } from "@/lib/companyFirstSearch/devSearch.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (req: NextRequest) => handleDevRoleSearch(req, "org");
export const POST = (req: NextRequest) => handleDevRoleSearch(req, "org");
