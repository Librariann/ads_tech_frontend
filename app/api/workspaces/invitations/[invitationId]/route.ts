import { NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/auth/proxy";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const { invitationId } = await params;
  if (!isInvitationId(invitationId)) {
    return NextResponse.json(
      { message: "초대 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return proxyAuthenticatedJson(`/workspaces/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

function isInvitationId(value: string) {
  return /^[1-9]\d*$/.test(value);
}
