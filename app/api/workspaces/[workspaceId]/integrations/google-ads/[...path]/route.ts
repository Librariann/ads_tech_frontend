import { NextResponse } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth/proxy";
import { reportQuery } from "@/lib/integrations/google-ads-report";

type Context = { params: Promise<{ workspaceId: string; path: string[] }> };

async function forward(request: Request, context: Context) {
  const { workspaceId, path } = await context.params;
  const route = path.join("/");
  if (path[0] === "campaigns") {
    // Keep campaign writes isolated from the older onboarding body's permissive proxy.
    const { campaignInput, campaignUuidPattern, campaignIdPattern } = await import(
      "@/lib/integrations/google-ads-campaign"
    );
    const creationUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/i;
    const reply = (message: string, status: number) => NextResponse.json(
      { message }, { status, headers: { "Cache-Control": "private, no-store" } }
    );
    const create = request.method === "POST" && path.length === 1;
    const lookup = request.method === "GET" && path.length === 3 &&
      path[1] === "requests" && campaignUuidPattern.test(path[2]);
    const details = request.method === "GET" && path.length === 4 && path[1] === "requests" &&
      campaignUuidPattern.test(path[2]) && path[3] === "details";
    const managedList = request.method === "GET" && path.length === 2 && path[1] === "managed";
    const discovery = request.method === "GET" && path.length === 5 && path[1] === "accounts" &&
      campaignIdPattern.test(path[2]) && campaignIdPattern.test(path[3]) && path[4] === "ads";
    const adGroupTarget = path[1] === "accounts" && campaignIdPattern.test(path[2] ?? "") &&
      campaignIdPattern.test(path[3] ?? "") && path[4] === "ad-groups";
    const adGroupPrepare = request.method === "GET" && adGroupTarget && path.length === 6 && path[5] === "prepare";
    const adGroupCreate = request.method === "POST" && adGroupTarget && path.length === 5;
    const adGroupLookup = request.method === "GET" && path.length === 3 && path[1] === "ad-group-requests" && campaignUuidPattern.test(path[2]);
    const managedDetails = request.method === "GET" && path.length === 3 && path[1] === "managed" && creationUuid.test(path[2]);
    const update = request.method === "POST" && path.length === 4 && path[1] === "managed" && creationUuid.test(path[2]) && path[3] === "updates";
    const updateLookup = request.method === "GET" && path.length === 3 && path[1] === "updates" && campaignUuidPattern.test(path[2]);
    if (!/^[1-9]\d*$(?![\s\S])/.test(workspaceId) || (!create && !lookup && !details && !managedList && !managedDetails && !update && !updateLookup && !discovery && !adGroupPrepare && !adGroupCreate && !adGroupLookup)) {
      return reply("요청을 찾을 수 없습니다.", 404);
    }
    const url = new URL(request.url);
    if (url.search) return reply("허용되지 않은 조회 조건입니다.", 400);
    let campaignBody: string | undefined;
    if (create || update || adGroupCreate) {
      if (request.headers.get("origin") !== url.origin ||
        ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")) {
        return reply("허용되지 않은 요청입니다.", 403);
      }
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return reply("JSON 요청이 필요합니다.", 415);
      }
      try {
        const reader = request.body?.getReader();
        if (!reader) return reply("캠페인 입력을 확인해 주세요.", 400);
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16 * 1024) {
            await reader.cancel();
            return reply("요청 내용이 너무 큽니다.", 413);
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        const input = adGroupCreate ? (await import("@/lib/integrations/google-ads-ad-group")).adGroupInput(payload)
          : update ? (await import("@/lib/integrations/google-ads-managed")).adUpdateInput(payload) : campaignInput(payload);
        if (!input) return reply("캠페인, 광고그룹, 광고 문구와 키워드를 확인해 주세요.", 400);
        campaignBody = JSON.stringify(input);
      } catch {
        return reply("캠페인 입력을 확인해 주세요.", 400);
      }
    }
    // The authenticated backend enforces workspace role, account ownership, test-only and PAUSED.
    const response = await proxyAuthenticatedJson(
      `/workspaces/${workspaceId}/integrations/google-ads/${route}`,
      {
        method: request.method, cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: campaignBody,
      }
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const allowed =
    request.method === "GET"
      ? /^(report|account-creation|onboarding|connections|accounts|connections\/[1-9]\d*\/available-accounts)$/.test(
          route
        )
      : /^(oauth\/start|accounts|account-creations|account-creations\/[1-9]\d*\/retry-invitation)$/.test(
          route
        );
  if (!/^[1-9]\d*$/.test(workspaceId) || !allowed) {
    return NextResponse.json(
      { message: "요청을 찾을 수 없습니다." },
      { status: 404 }
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
      { status: 400 }
    );
  }
  let suffix =
    route === "onboarding" && connectionIds.length === 1
      ? `?connectionId=${encodeURIComponent(connectionIds[0])}`
      : "";
  if (route === "report") {
    const allowedQuery = reportQuery(query);
    if (allowedQuery === null) {
      return NextResponse.json(
        { message: "조회 기간(최대 92일)과 광고계정을 확인해 주세요." },
        { status: 400 }
      );
    }
    suffix = `?${allowedQuery}`;
  }
  let body: string | undefined;
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json(
        { message: "허용되지 않은 요청입니다." },
        { status: 403 }
      );
    }
    if (route !== "oauth/start") {
      try {
        body = JSON.stringify(await request.json());
      } catch {
        return NextResponse.json(
          { message: "광고계정을 확인해 주세요." },
          { status: 400 }
        );
      }
    }
  }
  const response = await proxyAuthenticatedJson(
    `/workspaces/${workspaceId}/integrations/google-ads/${route}${suffix}`,
    {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body,
    }
  );
  if (route === "report")
    response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const GET = forward;
export const POST = forward;
