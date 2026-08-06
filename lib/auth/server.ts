import "server-only";

import type { NextResponse } from "next/server";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
};

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string | null;
};

export class AuthBackendUnavailableError extends Error {
  constructor() {
    super("Authentication service is unavailable");
  }
}

export function getAuthApiUrl() {
  return (process.env.AUTH_API_URL ?? "http://localhost:8000").replace(
    /\/$/,
    "",
  );
}

export async function authBackendFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(`${getAuthApiUrl()}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new AuthBackendUnavailableError();
  }
}

export async function refreshAuthTokens(refreshToken: string) {
  const response = await authBackendFetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new AuthBackendUnavailableError();
  }

  return parseAuthTokens(await response.json());
}

export function fetchAuthUser(accessToken: string) {
  return authBackendFetch("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function setAuthCookies(response: NextResponse, tokens: AuthTokens) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: getAccessTokenMaxAge(tokens.accessToken),
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function parseAuthTokens(value: unknown): AuthTokens | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("accessToken" in value) ||
    !("refreshToken" in value) ||
    typeof value.accessToken !== "string" ||
    typeof value.refreshToken !== "string"
  ) {
    return null;
  }

  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    tokenType: "Bearer",
  };
}

export async function getBackendErrorMessage(response: Response) {
  const fallback =
    response.status === 401
      ? "이메일 또는 비밀번호를 확인해 주세요."
      : "로그인 요청을 처리하지 못했습니다.";

  try {
    const payload = (await response.json()) as {
      message?: string | string[];
    };
    const message = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message;

    if (
      message === "Invalid credentials" ||
      message === "Invalid refresh token"
    ) {
      return fallback;
    }

    return message || fallback;
  } catch {
    return fallback;
  }
}

function getAccessTokenMaxAge(token: string) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as { exp?: number };

    if (payload.exp) {
      return Math.max(payload.exp - Math.floor(Date.now() / 1000), 1);
    }
  } catch {
    // Use the backend's default JWT lifetime when the token is malformed.
  }

  return 15 * 60;
}
