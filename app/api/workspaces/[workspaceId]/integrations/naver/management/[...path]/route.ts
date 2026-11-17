import { NextResponse } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth/proxy";
import { isNaverId } from "@/lib/integrations/naver";
import {
  isNaverRequestId, isRecord, NAVER_MANAGEMENT_CODES, naverManagementQuery, naverOperationInput, operationMatches,
  parseManagedNaverAdgroups, parseManagedNaverCampaigns, parseManagedNaverKeywords, parseNaverChannels, parseNaverOperation,
} from "@/lib/integrations/naver-management";

type Context = { params: Promise<{ workspaceId: string; path: string[] }> };
const reply = (status: number) => NextResponse.json({ message: "네이버 검색광고 요청을 처리하지 못했습니다." }, { status, headers: { "Cache-Control": "private, no-store" } });

async function forward(request: Request, context: Context) {
  const { workspaceId, path } = await context.params;
  const route = path[0];
  const allowed = request.method === "GET" ? (path.length === 1 && ["campaigns", "channels", "adgroups", "keywords", "pending"].includes(route)) ||
    (path.length === 2 && route === "operations" && isNaverRequestId(path[1])) : request.method === "POST" && path.length === 1 && route === "operations";
  if (!isNaverId(workspaceId) || !allowed) return reply(404);
  const url = new URL(request.url);
  const suffix = request.method === "GET" ? naverManagementQuery(path, url.searchParams) : url.search ? null : "";
  if (suffix === null) return reply(400);
  let input: ReturnType<typeof naverOperationInput> = null;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== url.origin || ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")) return reply(403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || BigInt(length) > BigInt(4096))) return reply(413);
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    try {
      const bytes = new Uint8Array(4096);
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (size + value.byteLength > bytes.length) { await reader.cancel(); return reply(413); }
        bytes.set(value, size); size += value.byteLength;
      }
      input = naverOperationInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size))));
      if (!input) return reply(400);
    } catch { return reply(400); }
    finally { reader.releaseLock(); }
  }
  let response: Response;
  try {
    response = await proxyAuthenticatedJson(`/workspaces/${workspaceId}/integrations/naver/management/${path.join("/")}${suffix}`, {
      method: request.method, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}),
    });
  } catch { return reply(503); }
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "private, no-store" });
  for (const cookie of response.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const code = NAVER_MANAGEMENT_CODES.find((safe) => isRecord(payload) && payload.code === safe);
    return NextResponse.json({ message: "네이버 검색광고 요청을 처리하지 못했습니다.", ...(code ? { code } : {}) }, { status: response.status, headers });
  }
  const safe = route === "campaigns" ? parseManagedNaverCampaigns(payload) : route === "channels" ? parseNaverChannels(payload)
    : route === "adgroups" ? parseManagedNaverAdgroups(payload) : route === "keywords" ? parseManagedNaverKeywords(payload)
      : route === "pending" && payload === null ? null : parseNaverOperation(payload);
  const accountId = url.searchParams.get("accountId");
  const invalid = (safe === null && !(route === "pending" && payload === null)) ||
    (Array.isArray(safe) && safe.some((item) => ("campaignId" in item && item.campaignId !== url.searchParams.get("campaignId")) || ("adgroupId" in item && item.adgroupId !== url.searchParams.get("adgroupId")))) ||
    (safe && !Array.isArray(safe) && "requestId" in safe && (input ? !operationMatches(safe, input) : route === "operations" ? safe.requestId !== path[1] : safe.accountId !== accountId || !["pending", "unknown"].includes(safe.status)));
  if (invalid) return NextResponse.json({ message: "네이버 검색광고 응답을 확인하지 못했습니다." }, { status: 502, headers });
  return NextResponse.json(safe, { headers });
}

export const GET = forward;
export const POST = forward;
