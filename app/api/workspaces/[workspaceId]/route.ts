import { NextResponse } from "next/server";

import { proxyAuthenticatedJson } from "@/lib/auth/proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!isWorkspaceId(workspaceId)) {
    return NextResponse.json(
      { message: "워크스페이스를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return proxyAuthenticatedJson(`/workspaces/${workspaceId}`);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!isWorkspaceId(workspaceId)) {
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
      { message: "요청 내용을 확인해 주세요." },
      { status: 400 },
    );
  }

  return proxyAuthenticatedJson(`/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function isWorkspaceId(value: string) {
  return /^[1-9]\d*$/.test(value);
}
