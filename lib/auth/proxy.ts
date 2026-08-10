import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  AuthBackendUnavailableError,
  type AuthTokens,
  REFRESH_TOKEN_COOKIE,
  authBackendFetch,
  clearAuthCookies,
  refreshAuthTokens,
  setAuthCookies,
} from "@/lib/auth/server";

type AuthenticatedBackendResult = {
  response: Response;
  refreshedTokens?: AuthTokens;
  clearCookies?: boolean;
};

export async function proxyAuthenticatedJson(
  path: string,
  init?: RequestInit,
) {
  try {
    const result = await authenticatedBackendFetch(path, init);
    const body = await result.response.text();
    const response = new NextResponse(body || null, {
      status: result.response.status,
      headers: {
        "Content-Type":
          result.response.headers.get("content-type") ?? "application/json",
      },
    });

    if (result.refreshedTokens) {
      setAuthCookies(response, result.refreshedTokens);
    }
    if (result.clearCookies) {
      clearAuthCookies(response);
    }

    return response;
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) {
      return NextResponse.json(
        { message: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    throw error;
  }
}

async function authenticatedBackendFetch(
  path: string,
  init?: RequestInit,
): Promise<AuthenticatedBackendResult> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (accessToken) {
    const response = await fetchWithToken(path, accessToken, init);
    if (response.status !== 401) {
      return { response };
    }
  }

  if (refreshToken) {
    const refreshedTokens = await refreshAuthTokens(refreshToken);
    if (refreshedTokens) {
      const response = await fetchWithToken(
        path,
        refreshedTokens.accessToken,
        init,
      );
      return {
        response,
        refreshedTokens,
        clearCookies: response.status === 401,
      };
    }
  }

  return {
    response: Response.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    ),
    clearCookies: true,
  };
}

function fetchWithToken(path: string, accessToken: string, init?: RequestInit) {
  return authBackendFetch(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
