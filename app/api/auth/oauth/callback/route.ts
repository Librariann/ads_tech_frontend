import { NextResponse } from "next/server";

import {
  AuthBackendUnavailableError,
  authBackendFetch,
  parseAuthTokens,
  setAuthCookies,
} from "@/lib/auth/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return redirectToLogin(requestUrl, "oauth");
  }

  try {
    const backendResponse = await authBackendFetch("/auth/oauth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!backendResponse.ok) {
      return redirectToLogin(requestUrl, "oauth");
    }

    const tokens = parseAuthTokens(await backendResponse.json());
    if (!tokens) {
      return redirectToLogin(requestUrl, "oauth");
    }

    const response = NextResponse.redirect(new URL("/", requestUrl));
    setAuthCookies(response, tokens);
    return response;
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) {
      return redirectToLogin(requestUrl, "backend");
    }
    throw error;
  }
}

function redirectToLogin(requestUrl: URL, error: string) {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}
