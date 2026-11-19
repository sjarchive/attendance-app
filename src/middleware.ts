// Route protection (plan Step 3).
// The UI is a single-page app at "/", so instead of redirecting pages we guard
// the API surface: any /api/* route except /api/auth/* requires a valid
// signed session cookie, otherwise 401 JSON. Route handlers additionally
// re-verify roles/ownership (defense in depth).
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, sessionCookieName } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  const payload = await verifySessionToken(token);

  if (!payload) {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  // Protect everything under /api except /api/auth/* (login/logout/me)
  matcher: ["/api/((?!auth).*)"],
};
