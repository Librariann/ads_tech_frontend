import { NextResponse } from "next/server";

import {
  AuthBackendUnavailableError,
  authBackendFetch,
  getBackendErrorMessage,
  parseAuthTokens,
  setAuthCookies,
} from "@/lib/auth/server";

export async function POST(request: Request) {
  let credentials: unknown;

  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json(
      { message: "로그인 정보를 다시 입력해 주세요." },
      { status: 400 },
    );
  }

  if (
    typeof credentials !== "object" ||
    credentials === null ||
    !("email" in credentials) ||
    !("password" in credentials) ||
    typeof credentials.email !== "string" ||
    typeof credentials.password !== "string"
  ) {
    return NextResponse.json(
      { message: "이메일과 비밀번호를 입력해 주세요." },
      { status: 400 },
    );
  }

  try {
    const backendResponse = await authBackendFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });

    if (!backendResponse.ok) {
      return NextResponse.json(
        { message: await getBackendErrorMessage(backendResponse) },
        { status: backendResponse.status },
      );
    }

    const tokens = parseAuthTokens(await backendResponse.json());
    if (!tokens) {
      return NextResponse.json(
        { message: "인증 서버 응답 형식이 올바르지 않습니다." },
        { status: 502 },
      );
    }

    const response = NextResponse.json({ authenticated: true });
    setAuthCookies(response, tokens);
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
