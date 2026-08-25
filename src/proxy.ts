import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const PUBLIC_PATHS = ["/login", "/api/health", "/manifest.webmanifest", "/icons/"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((item) => path === item || path.startsWith(item));
  if (isPublic || path.startsWith("/_next/")) return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!favicon.ico).*)"] };
