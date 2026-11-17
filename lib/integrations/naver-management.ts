import { isNaverId } from "@/lib/integrations/naver";

export type ManagedNaverCampaign = { id: string; name: string; status: string; campaignType: string; userLock: boolean; dailyBudget: string | null };
export type NaverChannel = { id: string; name: string; type: string; url: string | null; status: string };
export type ManagedNaverAdgroup = { id: string; campaignId: string; name: string; status: string; adgroupType: string; userLock: boolean; bidAmt: string; pcChannelId: string | null; mobileChannelId: string | null };
export type ManagedNaverKeyword = { id: string; campaignId: string; adgroupId: string; keyword: string; status: string; userLock: boolean; bidAmt: string; useGroupBidAmt: boolean };
export type NaverPayloads = {
  create_campaign: { name: string; dailyBudget: string };
  budget_campaign: { campaignId: string; dailyBudget: string };
  create_adgroup: { campaignId: string; name: string; bidAmt: string; pcChannelId: string; mobileChannelId: string };
  bid_adgroup: { campaignId: string; adgroupId: string; bidAmt: string };
  create_keyword: { campaignId: string; adgroupId: string; keyword: string; bidAmt: string };
  bid_keyword: { campaignId: string; adgroupId: string; keywordId: string; bidAmt: string };
};
export type NaverAction = keyof NaverPayloads;
export type NaverIntent = { requestId: string; accountId: string; action: NaverAction };
export type NaverOperationInput = { [A in NaverAction]: NaverIntent & { action: A; payload: NaverPayloads[A] } }[NaverAction];
export type NaverOperation = NaverIntent & { status: "pending" | "succeeded" | "failed" | "unknown"; result: Record<string, string> | null; errorCode: string | null; createdAt: string; updatedAt: string };

export const NAVER_MANAGEMENT_CODES = [
  "NAVER_ADS_AUTH_FAILED", "NAVER_ADS_NOT_CONFIGURED", "NAVER_ADS_UNAVAILABLE", "NAVER_ADS_RATE_LIMITED",
  "NAVER_ADS_INVALID_INPUT", "NAVER_ADS_PAUSED_REQUIRED", "NAVER_ADS_UNSUPPORTED_TYPE", "NAVER_ADS_CHANNEL_REQUIRED",
  "NAVER_ADS_OPERATION_CONFLICT", "NAVER_ADS_OPERATION_UNKNOWN", "ACTIVE_SUBSCRIPTION_REQUIRED",
  "NAVER_ADS_REJECTED", "NAVER_ADS_INVALID_RESPONSE",
] as const;
const actions: NaverAction[] = ["create_campaign", "budget_campaign", "create_adgroup", "bid_adgroup", "create_keyword", "bid_keyword"];
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
export const isNccId = (v: unknown): v is string => text(v) && v.length >= 1 && v.length <= 100 && !/[^A-Za-z0-9_-]/.test(v);
export const isNaverRequestId = (v: unknown): v is string => text(v) && v.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const keysAre = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const amount = (v: unknown): v is string => text(v) && v.length <= 20 && v.length > 0 && !/[^0-9]/.test(v);
export function validNaverAmount(v: unknown, budget = false): v is string {
  return amount(v) && BigInt(v) >= BigInt(70) && BigInt(v) <= BigInt(budget ? 1_000_000_000 : 100_000) && BigInt(v) % BigInt(10) === BigInt(0);
}
function cleanName(v: unknown, max: number) {
  if (!text(v) || /[\u0000-\u001f\u007f-\u009f]/.test(v)) return null;
  const name = v.trim();
  return Array.from(name).length >= 1 && Array.from(name).length <= max ? name : null;
}
export function parseNaverIntent(v: unknown, accountId?: string): NaverIntent | null {
  if (!isRecord(v) || !keysAre(v, ["requestId", "accountId", "action"]) || !isNaverRequestId(v.requestId) ||
    !isNaverId(v.accountId) || (accountId !== undefined && v.accountId !== accountId) || !actions.includes(v.action as NaverAction)) return null;
  return { requestId: v.requestId, accountId: v.accountId, action: v.action as NaverAction };
}
export function naverOperationInput(v: unknown): NaverOperationInput | null {
  if (!isRecord(v) || !keysAre(v, ["requestId", "accountId", "action", "payload"]) || !isRecord(v.payload)) return null;
  const intent = parseNaverIntent({ requestId: v.requestId, accountId: v.accountId, action: v.action });
  if (!intent) return null;
  const p = v.payload;
  const expected: Record<NaverAction, string[]> = {
    create_campaign: ["name", "dailyBudget"], budget_campaign: ["campaignId", "dailyBudget"],
    create_adgroup: ["campaignId", "name", "bidAmt", "pcChannelId", "mobileChannelId"],
    bid_adgroup: ["campaignId", "adgroupId", "bidAmt"], create_keyword: ["campaignId", "adgroupId", "keyword", "bidAmt"],
    bid_keyword: ["campaignId", "adgroupId", "keywordId", "bidAmt"],
  };
  if (!keysAre(p, expected[intent.action])) return null;
  for (const key of expected[intent.action]) {
    if (key.endsWith("Id") && !isNccId(p[key])) return null;
    if (key === "dailyBudget" && !validNaverAmount(p[key], true)) return null;
    if (key === "bidAmt" && !validNaverAmount(p[key])) return null;
    if ((key === "name" || key === "keyword") && !cleanName(p[key], key === "name" ? 50 : 25)) return null;
  }
  return { ...intent, payload: { ...p, ...(p.name !== undefined ? { name: cleanName(p.name, 50) } : {}),
    ...(p.keyword !== undefined ? { keyword: cleanName(p.keyword, 25) } : {}) } } as NaverOperationInput;
}
export function naverManagementQuery(path: string[], query: URLSearchParams): string | null {
  if (path.length === 2 && path[0] === "operations" && isNaverRequestId(path[1])) return query.size === 0 ? "" : null;
  if (path.length !== 1) return null;
  const keys = path[0] === "keywords" ? ["accountId", "campaignId", "adgroupId"] : path[0] === "adgroups"
    ? ["accountId", "campaignId"] : ["campaigns", "channels", "pending"].includes(path[0]) ? ["accountId"] : null;
  if (!keys || [...query.keys()].some((key) => !keys.includes(key)) || keys.some((key) => query.getAll(key).length !== 1)) return null;
  const out = new URLSearchParams();
  for (const key of keys) {
    const value = query.get(key);
    if (!(key === "accountId" ? isNaverId(value) : isNccId(value))) return null;
    out.set(key, value as string);
  }
  return `?${out}`;
}
function parseList<T>(v: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const items: T[] = [];
  const ids = new Set<string>();
  for (const item of v) {
    const value = parse(item);
    if (!value || !isRecord(item) || !isNccId(item.id) || ids.has(item.id)) return null;
    ids.add(item.id); items.push(value);
  }
  return items;
}
export function parseManagedNaverCampaigns(v: unknown) {
  return parseList<ManagedNaverCampaign>(v, (c) => {
    if (!isRecord(c) || !isNccId(c.id) || !text(c.name) || !text(c.status) || !text(c.campaignType) || typeof c.userLock !== "boolean" || !(c.dailyBudget === null || amount(c.dailyBudget))) return null;
    return { id: c.id, name: c.name, status: c.status, campaignType: c.campaignType, userLock: c.userLock, dailyBudget: c.dailyBudget };
  });
}
export function parseNaverChannels(v: unknown) {
  return parseList<NaverChannel>(v, (c) => {
    if (!isRecord(c) || !isNccId(c.id) || ![c.name, c.type, c.status].every(text) || !(c.url === null || text(c.url))) return null;
    return { id: c.id, name: c.name as string, type: c.type as string, status: c.status as string, url: c.url };
  });
}
export function parseManagedNaverAdgroups(v: unknown) {
  return parseList<ManagedNaverAdgroup>(v, (g) => {
    if (!isRecord(g) || !isNccId(g.id) || !isNccId(g.campaignId) || !text(g.name) || !text(g.status) || !text(g.adgroupType) ||
      typeof g.userLock !== "boolean" || !amount(g.bidAmt) || !(g.pcChannelId === null || isNccId(g.pcChannelId)) || !(g.mobileChannelId === null || isNccId(g.mobileChannelId))) return null;
    return { id: g.id, campaignId: g.campaignId, name: g.name, status: g.status, adgroupType: g.adgroupType, userLock: g.userLock,
      bidAmt: g.bidAmt, pcChannelId: g.pcChannelId, mobileChannelId: g.mobileChannelId };
  });
}
export function parseManagedNaverKeywords(v: unknown) {
  return parseList<ManagedNaverKeyword>(v, (k) => {
    if (!isRecord(k) || !isNccId(k.id) || !isNccId(k.campaignId) || !isNccId(k.adgroupId) || !text(k.keyword) || !text(k.status) ||
      typeof k.userLock !== "boolean" || !amount(k.bidAmt) || typeof k.useGroupBidAmt !== "boolean") return null;
    return { id: k.id, campaignId: k.campaignId, adgroupId: k.adgroupId, keyword: k.keyword, status: k.status, userLock: k.userLock, bidAmt: k.bidAmt, useGroupBidAmt: k.useGroupBidAmt };
  });
}
export function parseNaverOperation(v: unknown): NaverOperation | null {
  if (!isRecord(v)) return null;
  const intent = parseNaverIntent({ requestId: v.requestId, accountId: v.accountId, action: v.action });
  if (!intent || !["pending", "succeeded", "failed", "unknown"].includes(v.status as string) || !(v.result === null || isRecord(v.result)) ||
    !(v.errorCode === null || text(v.errorCode)) || !text(v.createdAt) || !Number.isFinite(Date.parse(v.createdAt)) || !text(v.updatedAt) || !Number.isFinite(Date.parse(v.updatedAt))) return null;
  // Only resource identifiers are public; provider bodies and messages are never forwarded.
  const result: Record<string, string> | null = v.result === null ? null : {};
  if (result && isRecord(v.result)) for (const key of ["id", "campaignId", "adgroupId", "keywordId"]) if (isNccId(v.result[key])) result[key] = v.result[key];
  return { ...intent, status: v.status as NaverOperation["status"], result,
    errorCode: NAVER_MANAGEMENT_CODES.find((code) => code === v.errorCode) ?? null, createdAt: v.createdAt, updatedAt: v.updatedAt };
}
export function operationMatches(op: NaverIntent, intent: NaverIntent) {
  return op.requestId === intent.requestId && op.accountId === intent.accountId && op.action === intent.action;
}
export const editableNaverCampaign = (c?: ManagedNaverCampaign) => c?.userLock === true && c.campaignType === "WEB_SITE";
export const editableNaverAdgroup = (c?: ManagedNaverCampaign, g?: ManagedNaverAdgroup) => editableNaverCampaign(c) && g?.userLock === true && g.adgroupType === "WEB_SITE" && g.campaignId === c?.id;
export const editableNaverKeyword = (c?: ManagedNaverCampaign, g?: ManagedNaverAdgroup, k?: ManagedNaverKeyword) => editableNaverAdgroup(c, g) && k?.userLock === true && k.campaignId === c?.id && k.adgroupId === g?.id;

export function naverManagementError(code?: string, status = 0) {
  const messages: Record<string, string> = {
    NAVER_ADS_AUTH_FAILED: "네이버 검색광고 인증을 확인해 주세요. 광고계정 연결 화면에서 인증 정보를 확인할 수 있습니다.",
    NAVER_ADS_NOT_CONFIGURED: "네이버 검색광고 연결 설정이 준비되지 않았습니다. 서비스 관리자에게 문의해 주세요.",
    NAVER_ADS_UNAVAILABLE: "네이버 검색광고에 연결하지 못했습니다. 잠시 후 상태를 다시 확인해 주세요.",
    NAVER_ADS_RATE_LIMITED: "요청이 많습니다. 잠시 후 상태를 다시 확인해 주세요.",
    NAVER_ADS_INVALID_INPUT: "이름, 예산과 입찰가 입력을 확인해 주세요.",
    NAVER_ADS_PAUSED_REQUIRED: "일시중지된 캠페인·광고그룹·키워드만 변경할 수 있습니다. 현재 상태를 다시 확인해 주세요.",
    NAVER_ADS_UNSUPPORTED_TYPE: "웹사이트 검색광고(WEB_SITE)만 변경할 수 있습니다.",
    NAVER_ADS_CHANNEL_REQUIRED: "등록된 SITE 비즈채널을 PC와 모바일에 각각 선택해 주세요.",
    NAVER_ADS_OPERATION_CONFLICT: "이 계정에 확인이 필요한 다른 요청이 있습니다. 상태를 다시 확인해 주세요.",
    NAVER_ADS_OPERATION_UNKNOWN: "요청 결과를 아직 확인할 수 없습니다. 중복 변경을 막기 위해 새 요청이 잠겼습니다.",
    NAVER_ADS_REJECTED: "네이버 검색광고에서 요청을 처리하지 못했습니다. 입력 내용과 현재 상태를 확인해 주세요.",
    NAVER_ADS_INVALID_RESPONSE: "네이버 검색광고 응답을 확인하지 못했습니다. 상태를 다시 확인해 주세요.",
    ACTIVE_SUBSCRIPTION_REQUIRED: "광고 변경에는 활성 서비스 구독이 필요합니다. 워크스페이스 구독을 확인해 주세요.",
    STORAGE_UNAVAILABLE: "요청 기록을 안전하게 저장할 수 없어 변경이 잠겼습니다. 브라우저 저장소를 확인한 뒤 상태를 다시 확인해 주세요.",
  };
  return messages[code ?? ""] ?? (status === 401 ? "로그인 세션을 확인해 주세요." : status === 403 ? "광고 변경은 워크스페이스 소유자 또는 관리자만 가능합니다." : "요청 상태를 확인하지 못했습니다. 잠시 후 상태를 다시 확인해 주세요.");
}
export class NaverManagementError extends Error {
  constructor(public code?: string, public status = 0) { super(naverManagementError(code, status)); }
}
export async function managementRequest(workspaceId: string, path: string, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/integrations/naver/management/${path}`, {
      ...init, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw new NaverManagementError(isRecord(payload) && text(payload.code) ? payload.code : undefined, response.status);
    if (payload === undefined) throw new NaverManagementError(undefined, 502);
    return payload;
  }
  catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    const e = error as { code?: string; status?: number };
    throw new NaverManagementError(e?.code, e?.status);
  }
}
