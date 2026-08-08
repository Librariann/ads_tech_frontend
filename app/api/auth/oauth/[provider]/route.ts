import { NextResponse } from "next/server";

import { getAuthApiUrl } from "@/lib/auth/server";

const providers = new Set(["google", "naver", "kakao"]);

export function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  return handleOAuthRedirect(request, params);
}

async function handleOAuthRedirect(
  request: Request,
  params: Promise<{ provider: string }>,
) {
  const { provider } = await params;

  if (!providers.has(provider)) {
    return NextResponse.redirect(new URL("/login?error=provider", request.url));
  }

  return NextResponse.redirect(`${getAuthApiUrl()}/auth/oauth/${provider}`);
}
