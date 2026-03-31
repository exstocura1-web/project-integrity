import { signDemoSession, SESSION_COOKIE_NAME } from "@/lib/auth-jwt";
import { isValidDemoPassphrase } from "@/lib/demo-passphrase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { passphrase?: string };
  try {
    body = (await request.json()) as { passphrase?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!isValidDemoPassphrase(String(body.passphrase ?? ""))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const token = await signDemoSession(8);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
