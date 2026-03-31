import { SignJWT, jwtVerify } from "jose";

const COOKIE = "bir_demo_session";

function getSecret(): Uint8Array {
  const raw =
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "dev-only-bir-demo-change-in-production-min-32-chars!" : "");
  if (!raw || raw.length < 16) {
    throw new Error("AUTH_SECRET must be set (min 16 characters) for BIR™ demo sessions.");
  }
  return new TextEncoder().encode(raw);
}

export async function signDemoSession(hoursValid = 8): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ scope: "bir-demo" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${hoursValid}h`)
    .sign(secret);
}

export async function verifyDemoSession(token: string): Promise<boolean> {
  try {
    const secret = getSecret();
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = COOKIE;

export async function verifyDemoSessionFromCookies(
  getCookie: (name: string) => string | undefined,
): Promise<boolean> {
  const token = getCookie(COOKIE);
  if (!token) return false;
  return verifyDemoSession(token);
}
