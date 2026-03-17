import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;

  // Only rewrite the app subdomain's root document.
  // Static assets such as /_next/* must pass through untouched.
  if (host.startsWith("app.") && pathname === "/") {
    return NextResponse.rewrite(new URL("/radar", req.url));
  }

  return NextResponse.next();
}
