import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  authBackendFetch,
  clearAuthCookies,
  refreshAuthTokens,
} from "@/lib/auth/server";

export async function POST() {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  try {
    if (!accessToken && refreshToken) {
      const tokens = await refreshAuthTokens(refreshToken);
      accessToken = tokens?.accessToken;
    }

    if (accessToken) {
      const logoutResponse = await authBackendFetch("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (logoutResponse.status === 401 && refreshToken) {
        const tokens = await refreshAuthTokens(refreshToken);
        if (tokens) {
          await authBackendFetch("/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
        }
      }
    }
  } catch {
    // Local cookies must still be cleared when the auth service is unavailable.
  }

  const response = NextResponse.json({ loggedOut: true });
  clearAuthCookies(response);
  return response;
}
