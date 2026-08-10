import { NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/auth/proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!/^[1-9]\d*$/.test(workspaceId)) {
    return NextResponse.json(
      { message: "워크스페이스를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return proxyAuthenticatedJson(`/workspaces/${workspaceId}/members`);
}
