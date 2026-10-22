import { NextResponse } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth/proxy";

type Context = { params: Promise<{ workspaceId: string; path: string[] }> };

async function forward(request: Request, context: Context) {
  const { workspaceId, path } = await context.params;
  const route = path.join("/");
  const allowed =
    request.method === "GET"
      ? /^(account-creation|onboarding|connections|accounts|connections\/[1-9]\d*\/available-accounts)$/.test(
          route,
        )
      : /^(oauth\/start|accounts|account-creations|account-creations\/[1-9]\d*\/retry-invitation)$/.test(
          route,
        );
  if (!/^[1-9]\d*$/.test(workspaceId) || !allowed) {
    return NextResponse.json(
      { message: "요청을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  const query = new URL(request.url).searchParams;
  const connectionIds = query.getAll("connectionId");
  if (
    route === "onboarding" &&
    (connectionIds.length > 1 ||
      (connectionIds.length === 1 && !/^[1-9]\d*$/.test(connectionIds[0])))
  ) {
    return NextResponse.json(
      { message: "인증 연결을 확인해 주세요." },
      { status: 400 },
    );
  }
  const suffix =
    route === "onboarding" && connectionIds.length === 1
      ? `?connectionId=${encodeURIComponent(connectionIds[0])}`
      : "";
  let body: string | undefined;
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { message: "허용되지 않은 요청입니다." },
        { status: 403 },
      );
    }
    if (route !== "oauth/start") {
      try {
        body = JSON.stringify(await request.json());
      } catch {
        return NextResponse.json(
          { message: "광고계정을 확인해 주세요." },
          { status: 400 },
        );
      }
    }
  }
  return proxyAuthenticatedJson(
    `/workspaces/${workspaceId}/integrations/google-ads/${route}${suffix}`,
    {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body,
    },
  );
}

export const GET = forward;
export const POST = forward;
