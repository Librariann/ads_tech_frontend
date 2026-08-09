import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AuthBackendUnavailableError,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  fetchAuthUser,
  refreshAuthTokens,
  setAuthCookies,
} from "@/lib/auth/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const returnTo = getSafeReturnPath(requestUrl.searchParams.get("returnTo"));
  const loginUrl = new URL("/login?error=session", request.url);
  const refreshToken = (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const tokens = await refreshAuthTokens(refreshToken);
    if (!tokens) {
      const response = NextResponse.redirect(loginUrl);
      clearAuthCookies(response);
      return response;
    }

    const userResponse = await fetchAuthUser(tokens.accessToken);
    if (!userResponse.ok) {
      const response = NextResponse.redirect(
        new URL(
          userResponse.status === 401
            ? "/login?error=session"
            : "/login?error=backend",
          request.url,
        ),
      );
      clearAuthCookies(response);
      return response;
    }

    const response = NextResponse.redirect(new URL(returnTo, request.url));
    setAuthCookies(response, tokens);
    return response;
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) {
      return NextResponse.redirect(
        new URL("/login?error=backend", request.url),
      );
    }
    throw error;
  }
}

function getSafeReturnPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}
