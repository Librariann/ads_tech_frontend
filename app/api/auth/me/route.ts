import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  AuthBackendUnavailableError,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  fetchAuthUser,
  getBackendErrorMessage,
  refreshAuthTokens,
  setAuthCookies,
} from "@/lib/auth/server";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  try {
    if (accessToken) {
      const userResponse = await fetchAuthUser(accessToken);
      if (userResponse.ok) {
        return NextResponse.json(await userResponse.json());
      }
      if (userResponse.status !== 401) {
        return NextResponse.json(
          { message: await getBackendErrorMessage(userResponse) },
          { status: userResponse.status },
        );
      }
    }

    if (refreshToken) {
      const tokens = await refreshAuthTokens(refreshToken);
      if (tokens) {
        const userResponse = await fetchAuthUser(tokens.accessToken);
        if (userResponse.ok) {
          const response = NextResponse.json(await userResponse.json());
          setAuthCookies(response, tokens);
          return response;
        }
        if (userResponse.status !== 401) {
          const response = NextResponse.json(
            { message: await getBackendErrorMessage(userResponse) },
            { status: userResponse.status },
          );
          setAuthCookies(response, tokens);
          return response;
        }
      }
    }

    const response = NextResponse.json(
      { message: "로그인이 필요합니다." },
      { status: 401 },
    );
    clearAuthCookies(response);
    return response;
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) {
      return NextResponse.json(
        { message: "인증 서버에 연결할 수 없습니다." },
        { status: 503 },
      );
    }
    throw error;
  }
}
