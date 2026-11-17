import { campaignErrorMessage, campaignIdPattern, campaignUuidPattern } from "./google-ads-campaign";
import { searchAdInput, type SearchAd } from "./google-ads-search-ad";

export type AdGroupScope = { accountId: string; customerId: string; campaignId: string; campaignName: string; currency: string };
export type AdGroupPrepare = AdGroupScope & { version: string };
export type AdGroupInput = { requestId: string; version: string; searchAd: SearchAd };
export type AdGroupResult = AdGroupScope & {
  requestId: string; status: "creating" | "created" | "failed" | "unknown"; searchAd: SearchAd;
  adGroupId: string | null; adResourceName: string | null; keywordResourceNames: string[];
  managementId: string | null; errorCode: string | null; createdAt: string; updatedAt: string;
};
export type AdGroupDraft = { schema: 1; scope: AdGroupScope; input: AdGroupInput; phase: "ready" | "submitted" | AdGroupResult["status"] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const scopeKeys = ["accountId", "customerId", "campaignId", "campaignName", "currency"] as const;
const versionPattern = /^[a-f0-9]{64}$(?![\s\S])/;
function validScope(value: unknown): value is AdGroupScope & Record<string, unknown> {
  return object(value) && typeof value.accountId === "string" && campaignIdPattern.test(value.accountId) &&
    typeof value.customerId === "string" && /^\d{10}$(?![\s\S])/.test(value.customerId) &&
    typeof value.campaignId === "string" && campaignIdPattern.test(value.campaignId) &&
    typeof value.campaignName === "string" && Boolean(value.campaignName.trim()) &&
    typeof value.currency === "string" && /^[A-Z]{3}$(?![\s\S])/.test(value.currency);
}
export function adGroupScopeMatches(value: AdGroupScope, scope: AdGroupScope) {
  // Names are audit metadata; the backend snapshot version guards renames after prepare.
  return (["accountId", "customerId", "campaignId", "currency"] as const).every((key) => value[key] === scope[key]);
}
export function adGroupInput(value: unknown): AdGroupInput | null {
  if (!object(value) || !exact(value, ["requestId", "version", "searchAd"]) ||
    typeof value.requestId !== "string" || !campaignUuidPattern.test(value.requestId) ||
    typeof value.version !== "string" || !versionPattern.test(value.version)) return null;
  const searchAd = searchAdInput(value.searchAd);
  return searchAd ? { requestId: value.requestId, version: value.version, searchAd } : null;
}
export function isAdGroupPrepare(value: unknown): value is AdGroupPrepare {
  return validScope(value) && object(value) && exact(value, [...scopeKeys, "version"]) &&
    typeof value.version === "string" && versionPattern.test(value.version);
}
export function isAdGroupResult(value: unknown): value is AdGroupResult {
  if (!validScope(value) || !object(value) || typeof value.requestId !== "string" || !campaignUuidPattern.test(value.requestId) ||
    typeof value.status !== "string" || !["creating", "created", "failed", "unknown"].includes(value.status) || !searchAdInput(value.searchAd)) return false;
  const resource = (name: unknown, collection: string) => typeof name === "string" &&
    typeof value.adGroupId === "string" && campaignIdPattern.test(value.adGroupId) &&
    new RegExp(`^customers/${value.customerId}/${collection}/${value.adGroupId}~[1-9]\\d*$(?![\\s\\S])`).test(name);
  if (value.adGroupId !== null && (typeof value.adGroupId !== "string" || !campaignIdPattern.test(value.adGroupId))) return false;
  if (value.adResourceName !== null && !resource(value.adResourceName, "adGroupAds")) return false;
  if (!Array.isArray(value.keywordResourceNames) || !value.keywordResourceNames.every((name) => resource(name, "adGroupCriteria")) ||
    new Set(value.keywordResourceNames).size !== value.keywordResourceNames.length || value.keywordResourceNames.length > (value.searchAd as SearchAd).keywords.length) return false;
  if (value.managementId !== null && (typeof value.managementId !== "string" || !campaignUuidPattern.test(value.managementId))) return false;
  return (value.errorCode === null || typeof value.errorCode === "string") &&
    [value.createdAt, value.updatedAt].every((date) => typeof date === "string" && Number.isFinite(Date.parse(date))) &&
    (value.status !== "created" || (value.adGroupId !== null && value.adResourceName !== null && value.managementId !== null &&
      value.keywordResourceNames.length === (value.searchAd as SearchAd).keywords.length && value.errorCode === null));
}

export function adGroupErrorMessage(code?: string, status?: number) {
  const messages: Record<string, string> = {
    GOOGLE_ADS_PAUSED_REQUIRED: "일시중지된 캠페인에만 광고 내용을 추가할 수 있습니다. 캠페인 상태를 확인해 주세요.",
    GOOGLE_ADS_CAMPAIGN_NOT_EMPTY: "이미 광고그룹이 있는 캠페인입니다. 광고를 다시 조회해 주세요.",
    GOOGLE_ADS_CAMPAIGN_TYPE_UNSUPPORTED: "검색 캠페인에만 광고 내용을 추가할 수 있습니다.",
    GOOGLE_ADS_CAMPAIGN_CHANGED: "캠페인이 변경되었습니다. 새 요청 준비로 현재 상태를 다시 확인해 주세요.",
    GOOGLE_ADS_AD_GROUP_PENDING: "광고 내용 추가 요청이 처리 중입니다. 저장된 요청 상태를 확인해 주세요.",
    GOOGLE_ADS_AD_GROUP_RESULT_UNKNOWN: "추가 결과를 확인하지 못했습니다. 중복 요청하지 말고 저장된 요청 상태를 확인해 주세요.",
    GOOGLE_ADS_AD_GROUP_REJECTED: "Google에서 광고 내용 추가를 거부했습니다. 입력 내용과 계정 상태를 확인해 주세요.",
    AD_GROUP_RESPONSE_INVALID: "선택한 캠페인과 응답이 일치하지 않습니다. 요청 상태와 광고를 다시 확인해 주세요.",
  };
  return (code && messages[code]) || campaignErrorMessage(code, status);
}
export class AdGroupApiError extends Error {
  constructor(public code?: string, public status?: number) { super(adGroupErrorMessage(code, status)); }
}
export function adGroupApi(workspaceId: string, scope: AdGroupScope) {
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/integrations/google-ads/campaigns`;
  const target = `${base}/accounts/${encodeURIComponent(scope.accountId)}/${encodeURIComponent(scope.campaignId)}/ad-groups`;
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(path, { ...init, cache: "no-store", credentials: "same-origin" });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new AdGroupApiError(object(value) && typeof value.code === "string" ? value.code : undefined, response.status);
    return value;
  }
  async function operation(path: string, requestId: string, init?: RequestInit, searchAd?: SearchAd) {
    const value = await request(path, init);
    if (!isAdGroupResult(value) || !adGroupScopeMatches(value, scope) || value.requestId.toLowerCase() !== requestId.toLowerCase() ||
      (searchAd && JSON.stringify(searchAdInput(value.searchAd)) !== JSON.stringify(searchAdInput(searchAd)))) throw new AdGroupApiError("AD_GROUP_RESPONSE_INVALID");
    return value;
  }
  return {
    prepare: async (signal?: AbortSignal): Promise<AdGroupPrepare> => {
      const value = await request(`${target}/prepare`, { signal });
      if (!isAdGroupPrepare(value) || !adGroupScopeMatches(value, scope)) throw new AdGroupApiError("AD_GROUP_RESPONSE_INVALID");
      return value;
    },
    create: (input: AdGroupInput, signal?: AbortSignal) => {
      if (!adGroupInput(input)) throw new AdGroupApiError("AD_GROUP_RESPONSE_INVALID");
      return operation(target, input.requestId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal }, input.searchAd);
    },
    lookup: (requestId: string, signal?: AbortSignal) => {
      if (!campaignUuidPattern.test(requestId)) throw new AdGroupApiError("AD_GROUP_RESPONSE_INVALID");
      return operation(`${base}/ad-group-requests/${encodeURIComponent(requestId)}`, requestId, { signal });
    },
  };
}
export function adGroupStorageKey(userId: string, workspaceId: string, scope: AdGroupScope) {
  return `growdoads:ad-group:v1:${[userId, workspaceId, scope.accountId, scope.customerId, scope.campaignId].map(encodeURIComponent).join(":")}`;
}
export function parseAdGroupDraft(raw: string, scope: AdGroupScope): AdGroupDraft | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || !exact(value, ["schema", "scope", "input", "phase"]) || value.schema !== 1 ||
      !validScope(value.scope) || !exact(value.scope, [...scopeKeys]) || !adGroupScopeMatches(value.scope, scope) || !adGroupInput(value.input) ||
      typeof value.phase !== "string" || !["submitted", "creating", "created", "failed", "unknown"].includes(value.phase)) return null;
    // Never normalize a saved intent: lookup and reconciliation use the exact submitted content.
    return value as AdGroupDraft;
  } catch { return null; }
}
type Api = Pick<ReturnType<typeof adGroupApi>, "create" | "lookup">;
type Save = (draft: AdGroupDraft) => void;
function settle(draft: AdGroupDraft, result: AdGroupResult, save: Save) {
  if (!isAdGroupResult(result) || !adGroupScopeMatches(result, draft.scope) ||
    result.requestId.toLowerCase() !== draft.input.requestId.toLowerCase() ||
    JSON.stringify(searchAdInput(result.searchAd)) !== JSON.stringify(searchAdInput(draft.input.searchAd))) throw new AdGroupApiError("AD_GROUP_RESPONSE_INVALID");
  const next: AdGroupDraft = { ...draft, phase: draft.phase === "unknown" && result.status === "creating" ? "unknown" : result.status };
  save(next);
  return { draft: next, result, error: result.errorCode ? adGroupErrorMessage(result.errorCode) : "" };
}
export async function recoverAdGroup(draft: AdGroupDraft, api: Api, save: Save, signal?: AbortSignal) {
  try { return settle(draft, await api.lookup(draft.input.requestId, signal), save); }
  catch (cause) {
    const next: AdGroupDraft = { ...draft, phase: draft.phase === "failed" || draft.phase === "created" ? draft.phase : "unknown" };
    save(next);
    return { draft: next, result: null, error: cause instanceof AdGroupApiError ? cause.message : adGroupErrorMessage("GOOGLE_ADS_AD_GROUP_RESULT_UNKNOWN") };
  }
}
export async function submitAdGroup(draft: AdGroupDraft, api: Api, save: Save, signal?: AbortSignal) {
  if (draft.phase !== "ready") throw new Error("Ad group request is locked");
  const pending: AdGroupDraft = { ...draft, phase: "submitted" };
  save(pending);
  try { return settle(pending, await api.create(pending.input, signal), save); }
  catch (cause) {
    const failure = cause instanceof AdGroupApiError ? cause : new AdGroupApiError("GOOGLE_ADS_AD_GROUP_RESULT_UNKNOWN");
    const rejected = ["GOOGLE_ADS_CAMPAIGN_CHANGED", "GOOGLE_ADS_PAUSED_REQUIRED", "GOOGLE_ADS_CAMPAIGN_NOT_EMPTY", "GOOGLE_ADS_CAMPAIGN_TYPE_UNSUPPORTED", "GOOGLE_ADS_AD_GROUP_REJECTED"].includes(failure.code ?? "");
    const next: AdGroupDraft = { ...pending, phase: rejected ? "failed" : "unknown" };
    save(next);
    if (rejected) return { draft: next, result: null, error: failure.message };
    const recovered = await recoverAdGroup(next, api, save, signal);
    return { ...recovered, error: recovered.error || (recovered.result ? "" : failure.message) };
  }
}
