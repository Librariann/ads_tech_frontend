import { NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/auth/proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!/^[1-9]\d*$/.test(workspaceId)) {
    return NextResponse.json(
      { message: "워크스페이스를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "초대할 이메일을 확인해 주세요." },
      { status: 400 },
    );
  }

  return proxyAuthenticatedJson(`/workspaces/${workspaceId}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
