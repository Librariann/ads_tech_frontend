import { NextResponse } from "next/server";
import { proxyAuthenticatedJson } from "@/lib/auth/proxy";
import {
  isNaverId, NAVER_SAFE_ERROR_CODES, naverAccountInput, naverReportQuery,
  parseNaverAccounts, parseNaverConfiguration, parseNaverReport,
} from "@/lib/integrations/naver";

type Context = { params: Promise<{ workspaceId: string; path: string[] }> };
const reply = (message: string, status: number) => NextResponse.json(
  { message }, { status, headers: { "Cache-Control": "private, no-store" } },
);

async function forward(request: Request, context: Context) {
  const { workspaceId, path } = await context.params;
  const route = path[0];
  const allowed = path.length === 1 && (request.method === "GET"
    ? ["configuration", "accounts", "report"].includes(route)
    : request.method === "POST" && route === "accounts");
  if (!isNaverId(workspaceId) || !allowed) return reply("요청을 찾을 수 없습니다.", 404);
  const url = new URL(request.url);
  let suffix = "";
  if (route === "report") {
    const query = naverReportQuery(url.searchParams);
    if (!query) return reply("광고계정과 조회 기간(최대 31일)을 확인해 주세요.", 400);
    suffix = `?${query}`;
  } else if (url.search) return reply("허용되지 않은 조회 조건입니다.", 400);

  let body: string | undefined;
  if (request.method === "POST") {
    if (request.headers.get("origin") !== url.origin ||
      ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")) return reply("허용되지 않은 요청입니다.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply("JSON 요청이 필요합니다.", 415);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || BigInt(length) > BigInt(4096))) return reply("요청 내용이 너무 큽니다.", 413);
    const reader = request.body?.getReader();
    if (!reader) return reply("광고계정 입력을 확인해 주세요.", 400);
    try {
      const bytes = new Uint8Array(4096);
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (size + value.byteLength > bytes.length) {
          await reader.cancel();
          return reply("요청 내용이 너무 큽니다.", 413);
        }
        bytes.set(value, size); size += value.byteLength;
      }
      const input = naverAccountInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size))));
      if (!input) return reply("고객 ID, 계정 이름과 인증 키 입력을 확인해 주세요.", 400);
      body = JSON.stringify(input);
    } catch { return reply("JSON 요청을 확인해 주세요.", 400); }
    finally { reader.releaseLock(); }
  }

  let response: Response;
  try {
    response = await proxyAuthenticatedJson(`/workspaces/${workspaceId}/integrations/naver/${route}${suffix}`, {
      method: request.method, cache: "no-store", headers: { "Content-Type": "application/json" }, body,
    });
  } catch { return reply("네이버 검색광고에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", 503); }
  // Preserve refreshed/cleared auth cookies, but never echo provider messages or registration responses.
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "private, no-store" });
  for (const cookie of response.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  if (response.ok && request.method === "POST") return NextResponse.json({ registered: true }, { status: 200, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const rawCode = payload && typeof payload === "object" && "code" in payload ? payload.code : undefined;
    const code = NAVER_SAFE_ERROR_CODES.find((safe) => safe === rawCode);
    return NextResponse.json({ message: "네이버 검색광고 요청을 처리하지 못했습니다.", ...(code ? { code } : {}) }, {
      status: response.status, headers,
    });
  }
  const safe = route === "configuration" ? parseNaverConfiguration(payload)
    : route === "accounts" ? parseNaverAccounts(payload) : parseNaverReport(payload);
  if (safe === null) return NextResponse.json({ message: "네이버 검색광고 응답을 확인하지 못했습니다." }, { status: 502, headers });
  return NextResponse.json(safe, { headers });
}

export const GET = forward;
export const POST = forward;
