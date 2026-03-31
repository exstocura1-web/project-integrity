import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const COOKIE = "bir_demo_session";

function encoderSecret(): Uint8Array | null {
  const raw =
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "dev-only-bir-demo-change-in-production-min-32-chars!"
      : "");
  if (!raw || raw.length < 16) return null;
  return new TextEncoder().encode(raw);
}

async function sessionValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = encoderSecret();
  if (!secret) return false;
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  const ok = await sessionValid(token);
  if (!ok) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/upload", "/upload/:path*", "/results/:path*", "/api/upload", "/api/runs/:path*"],
};
