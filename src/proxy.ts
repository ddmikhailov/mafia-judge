import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const PUBLIC_PATHS = new Set(["/login", "/reset-password", "/api/health", "/manifest.webmanifest"]);
const PUBLIC_PREFIXES = ["/icons/"];

export function isPublicPath(path: string) {
  return PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isPublicPath(path) || path.startsWith("/_next/")) return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!favicon.ico).*)"] };
