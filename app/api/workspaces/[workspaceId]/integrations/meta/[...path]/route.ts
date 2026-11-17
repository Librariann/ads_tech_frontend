import { NextResponse } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth/proxy";
import { metaAccountInput, isMetaId, metaReportQuery } from "@/lib/integrations/meta";

type Context = { params: Promise<{ workspaceId: string; path: string[] }> };
const reply = (message: string, status: number, code?: string) => NextResponse.json(
  { message, ...(code ? { code } : {}) }, { status, headers: { "Cache-Control": "private, no-store" } },
);

async function forward(request: Request, context: Context) {
  const { workspaceId, path } = await context.params;
  const route = path.join("/");
  const allowed = request.method === "GET"
    ? /^(configuration|connections|accounts|report)$/.test(route) ||
      (path.length === 3 && path[0] === "connections" && isMetaId(path[1]) && path[2] === "available-accounts")
    : request.method === "POST" && (route === "oauth/start" || route === "accounts");
  if (!isMetaId(workspaceId) || !allowed) return reply("요청을 찾을 수 없습니다.", 404);
  const url = new URL(request.url);
  let suffix = "";
  if (route === "report") {
    const query = metaReportQuery(url.searchParams);
    if (!query) return reply("광고계정과 조회 기간(최대 92일)을 확인해 주세요.", 400);
    suffix = `?${query}`;
  } else if (url.search) return reply("허용되지 않은 조회 조건입니다.", 400);
  let body: string | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== url.origin ||
      ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")) return reply("허용되지 않은 요청입니다.", 403);
    const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (mediaType && mediaType !== "application/json") return reply("JSON 요청이 필요합니다.", 415);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      const reader = request.body?.getReader();
      if (reader) while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return reply("요청 내용이 너무 큽니다.", 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const payload: unknown = raw ? JSON.parse(raw) : {};
      if (route === "oauth/start") {
        if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length) return reply("빈 인증 요청이 필요합니다.", 400);
      } else {
        if (mediaType !== "application/json") return reply("JSON 요청이 필요합니다.", 415);
        const input = metaAccountInput(payload);
        if (!input) return reply("광고계정 입력을 확인해 주세요.", 400);
        body = JSON.stringify(input);
      }
    } catch { return reply("JSON 요청을 확인해 주세요.", 400); }
  }
  const response = await proxyAuthenticatedJson(`/workspaces/${workspaceId}/integrations/meta/${route}${suffix}`, {
    method: request.method, cache: "no-store", headers: { "Content-Type": "application/json" }, body,
  });
  response.headers.set("Cache-Control", "private, no-store");
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const codes = ["META_ADS_REAUTH_REQUIRED", "META_ADS_NOT_CONFIGURED", "META_ADS_PERMISSION_REQUIRED", "META_ADS_RATE_LIMITED", "ENTITLEMENT_LIMIT_EXCEEDED", "ACTIVE_SUBSCRIPTION_REQUIRED"];
    const code = codes.includes(payload?.code) ? payload.code as string : undefined;
    // Provider errors may contain token-bearing URLs; never forward their messages.
    response.headers.set("Content-Type", "application/json");
    return new NextResponse(JSON.stringify({ message: "Meta 요청을 처리하지 못했습니다.", ...(code ? { code } : {}) }), {
      status: response.status, headers: response.headers,
    });
  }
  return response;
}

export const GET = forward;
export const POST = forward;
