import { NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/auth/proxy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { invitationId } = await params;
  if (!/^[1-9]\d*$/.test(invitationId)) {
    return NextResponse.json(
      { message: "초대 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return proxyAuthenticatedJson(
    `/workspaces/invitations/${invitationId}/accept`,
    { method: "POST" },
  );
}
