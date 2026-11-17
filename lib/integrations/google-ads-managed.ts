import { campaignBudgetText, campaignIdPattern, campaignUuidPattern, isCampaignDetails, type CampaignDetails } from "./google-ads-campaign";
import { searchAdInput, unsafeAdText, type PinnedAsset, type SearchAd, type SearchAdFields } from "./google-ads-search-ad";
import type { ReportAccount } from "./google-ads-report";

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const versionPattern = /^[a-f0-9]{64}$(?![\s\S])/i;
const creationUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/i;
export type ManagedCampaign = { creationRequestId: string; accountId: string; customerId: string; campaignId: string; name: string; adGroupId: string; currency: string };
export type DiscoveredAd = {
  id: string; resourceName: string; type: string; status: string; finalUrls: string[]; headlines: string[]; descriptions: string[];
  management: ManagedCampaign | null; unsupportedReason: string | null;
};
export type DiscoveredAdGroup = {
  id: string; name: string; status: string; type: string; cpcBidMicros: string | null;
  keywords: { text: string; matchType: string; status: string; resourceName: string; negative: boolean }[];
  ads: DiscoveredAd[];
};
export type CampaignAds = {
  accountId: string; customerId: string; campaignId: string; campaignName: string; campaignStatus: string; currency: string;
  adGroups: DiscoveredAdGroup[];
};
type DiscoveryAccount = Pick<ReportAccount, "accountId" | "customerId" | "currency">;
const status = (value: unknown) => typeof value === "string" && ["PAUSED", "ENABLED", "REMOVED", "UNKNOWN", "UNSPECIFIED"].includes(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const id = (value: unknown): value is string => typeof value === "string" && campaignIdPattern.test(value);
const resourceSuffix = (value: unknown, prefix: string) => typeof value === "string" && value.startsWith(prefix) && id(value.slice(prefix.length));

export function isCampaignAds(value: unknown, account: DiscoveryAccount, campaignId: string): value is CampaignAds {
  if (!object(value) || !id(value.accountId) || !id(value.campaignId) || value.accountId !== account.accountId || value.campaignId !== campaignId ||
    typeof value.customerId !== "string" || !/^\d{10}$(?![\s\S])/.test(value.customerId) || value.customerId !== account.customerId ||
    typeof value.currency !== "string" || !/^[A-Z]{3}$(?![\s\S])/.test(value.currency) || value.currency !== account.currency ||
    typeof value.campaignName !== "string" || !status(value.campaignStatus) || !Array.isArray(value.adGroups)) return false;
  const groups = new Set<string>();
  const bindings = new Set<string>();
  return value.adGroups.every((group) => {
    if (!object(group) || !id(group.id) || groups.has(group.id) || typeof group.name !== "string" || !status(group.status) ||
      typeof group.type !== "string" || !group.type || !(group.cpcBidMicros === null || (typeof group.cpcBidMicros === "string" && /^(0|[1-9]\d*)$(?![\s\S])/.test(group.cpcBidMicros))) ||
      !Array.isArray(group.keywords) || !Array.isArray(group.ads)) return false;
    groups.add(group.id);
    const prefix = `customers/${value.customerId}/`;
    const keywords = new Set<string>();
    const ads = new Set<string>();
    return group.keywords.every((keyword) => {
      if (!object(keyword) || typeof keyword.text !== "string" || typeof keyword.matchType !== "string" ||
        !["EXACT", "PHRASE", "BROAD", "UNKNOWN", "UNSPECIFIED"].includes(keyword.matchType) || !status(keyword.status) || typeof keyword.negative !== "boolean" ||
        !resourceSuffix(keyword.resourceName, `${prefix}adGroupCriteria/${group.id}~`) || keywords.has(keyword.resourceName as string)) return false;
      keywords.add(keyword.resourceName as string);
      return true;
    }) && group.ads.every((ad) => {
      if (!object(ad) || !id(ad.id) || ads.has(ad.id) || ad.resourceName !== `${prefix}adGroupAds/${group.id}~${ad.id}` ||
        typeof ad.type !== "string" || !ad.type || !status(ad.status) || !strings(ad.finalUrls) || !strings(ad.headlines) || !strings(ad.descriptions) ||
        !(ad.unsupportedReason === null || (typeof ad.unsupportedReason === "string" && Boolean(ad.unsupportedReason.trim())))) return false;
      ads.add(ad.id);
      if (ad.management === null) return true;
      const binding = ad.management;
      if (!isManagedCampaign(binding) || binding.accountId !== value.accountId || binding.customerId !== value.customerId ||
        binding.campaignId !== value.campaignId || binding.adGroupId !== group.id || binding.currency !== value.currency ||
        bindings.has(binding.creationRequestId.toLowerCase())) return false;
      bindings.add(binding.creationRequestId.toLowerCase());
      return true;
    });
  });
}

export function initialAdSelection(value: CampaignAds, creationRequestId: string) {
  for (const group of value.adGroups) {
    const ad = group.ads.find((item) => item.management?.creationRequestId.toLowerCase() === creationRequestId.toLowerCase());
    if (ad) return { adGroupId: group.id, adId: ad.id };
  }
  return { adGroupId: "", adId: "" };
}

export function managedCampaignOptions(accounts: ReportAccount[], managed: ManagedCampaign[], accountId: string) {
  const account = accounts.find((item) => item.accountId === accountId);
  if (account?.status !== "ok") return [];
  return account.campaigns.map((campaign) => ({
    ...campaign,
    managed: managed.find((item) => item.accountId === accountId && item.customerId === account.customerId && item.campaignId === campaign.id) ?? null,
  }));
}

export function initialCampaignSelection(accounts: ReportAccount[], managed: ManagedCampaign[], accountId: string, campaignId: string, creationRequestId: string) {
  const linked = creationRequestId ? managed.find((item) => item.creationRequestId.toLowerCase() === creationRequestId.toLowerCase() &&
    accounts.some((account) => account.accountId === item.accountId && account.customerId === item.customerId && account.currency === item.currency)) : undefined;
  const selectedAccountId = linked?.accountId ?? accountId;
  const selectedCampaignId = linked?.campaignId ?? campaignId;
  return {
    accountId: accounts.some((account) => account.accountId === selectedAccountId) ? selectedAccountId : "",
    campaignId: managedCampaignOptions(accounts, managed, selectedAccountId).some((campaign) => campaign.id === selectedCampaignId) ? selectedCampaignId : "",
  };
}
export type ManagedDetails = Omit<ManagedCampaign, "customerId" | "adGroupId"> & {
  version: string;
  details: CampaignDetails & { campaignStatus: string; adGroupName: string; readonlyReason?: string | null;
    headlineAssets?: PinnedAsset[]; descriptionAssets?: PinnedAsset[] };
  canEdit: boolean;
  readonlyReason?: string | null;
  pendingUpdate: { requestId: string; status: "applying" | "unknown"; errorCode: string | null } | null;
};
function validAssets(value: unknown, texts: string[]) {
  return value === undefined || (Array.isArray(value) && value.length === texts.length && value.every((asset, index) =>
    object(asset) && asset.text === texts[index] && (asset.pinnedField === null || typeof asset.pinnedField === "string")));
}
export type AdUpdateInput = { requestId: string; version: string; searchAd: SearchAd; keywordRemovalConsent: boolean };
export type AdUpdateResult = { requestId: string; creationRequestId: string; status: "applying" | "applied" | "failed" | "unknown"; errorCode: string | null; createdAt: string; updatedAt: string };
export type AdUpdateDraft = { schema: 1; creationRequestId: string; input: AdUpdateInput; phase: "submitted" | AdUpdateResult["status"] };

export function adUpdateInput(value: unknown): AdUpdateInput | null {
  if (!object(value) || Object.keys(value).length !== 4 ||
    !["requestId", "version", "searchAd", "keywordRemovalConsent"].every((key) => Object.hasOwn(value, key)) ||
    typeof value.requestId !== "string" || !campaignUuidPattern.test(value.requestId) ||
    typeof value.version !== "string" || !versionPattern.test(value.version) || typeof value.keywordRemovalConsent !== "boolean") return null;
  const searchAd = searchAdInput(value.searchAd);
  return searchAd ? { requestId: value.requestId.toLowerCase(), version: value.version, searchAd, keywordRemovalConsent: value.keywordRemovalConsent } : null;
}

export function isManagedCampaign(value: unknown): value is ManagedCampaign {
  return object(value) && typeof value.creationRequestId === "string" && creationUuid.test(value.creationRequestId) &&
    ["accountId", "campaignId", "adGroupId"].every((key) => typeof value[key] === "string" && campaignIdPattern.test(value[key] as string)) &&
    typeof value.customerId === "string" && /^\d{10}$(?![\s\S])/.test(value.customerId) && typeof value.name === "string" &&
    typeof value.currency === "string" && /^[A-Z]{3}$(?![\s\S])/.test(value.currency);
}

export function isManagedDetails(value: unknown): value is ManagedDetails {
  if (!object(value) || !object(value.details)) return false;
  const { campaignStatus, adGroupName, readonlyReason, headlineAssets, descriptionAssets } = value.details;
  if (!isCampaignDetails(value.details)) return false;
  const customerId = value.details.adResourceName.split("/")[1];
  const pending = value.pendingUpdate;
  return isManagedCampaign({ ...value, customerId, adGroupId: value.details.adGroupId }) &&
    value.campaignId === value.details.campaignId && typeof value.version === "string" && versionPattern.test(value.version) &&
    status(campaignStatus) && typeof adGroupName === "string" && typeof value.canEdit === "boolean" &&
    (value.readonlyReason === undefined || value.readonlyReason === null || typeof value.readonlyReason === "string") &&
    (readonlyReason === undefined || readonlyReason === null || typeof readonlyReason === "string") &&
    validAssets(headlineAssets, value.details.headlines) && validAssets(descriptionAssets, value.details.descriptions) &&
    (pending === null || (object(pending) && typeof pending.requestId === "string" && campaignUuidPattern.test(pending.requestId) &&
      typeof pending.status === "string" && ["applying", "unknown"].includes(pending.status) && (pending.errorCode === null || typeof pending.errorCode === "string")));
}

export function isAdUpdateResult(value: unknown): value is AdUpdateResult {
  return object(value) && typeof value.requestId === "string" && campaignUuidPattern.test(value.requestId) &&
    typeof value.creationRequestId === "string" && creationUuid.test(value.creationRequestId) &&
    typeof value.status === "string" && ["applying", "applied", "failed", "unknown"].includes(value.status) && (value.errorCode === null || typeof value.errorCode === "string") &&
    ["createdAt", "updatedAt"].every((key) => typeof value[key] === "string" && Number.isFinite(Date.parse(value[key] as string)));
}

export function managedErrorMessage(code?: string, status?: number): string {
  const messages: Record<string, string> = {
    GOOGLE_ADS_AD_UPDATE_CONFLICT: "광고 내용이 변경되었습니다. 최신 내용을 다시 조회한 뒤 수정해 주세요.",
    GOOGLE_ADS_AD_UPDATE_PENDING: "수정 요청이 처리 중입니다. 요청 상태를 확인해 주세요.",
    GOOGLE_ADS_AD_UPDATE_UNKNOWN: "수정 결과를 확인하지 못했습니다. 새 요청은 잠겼습니다. 기존 요청 상태를 확인해 주세요.",
    GOOGLE_ADS_PAUSED_REQUIRED: "캠페인, 광고그룹, 광고와 일반 키워드가 모두 일시중지 상태여야 수정할 수 있습니다. 제외 키워드는 변경하지 않습니다.",
    GOOGLE_ADS_KEYWORD_REMOVAL_CONSENT_REQUIRED: "제거할 기존 키워드 목록을 확인하고 제거에 동의해 주세요.",
    GOOGLE_ADS_AD_UPDATE_REJECTED: "Google에서 수정을 거부했습니다. 최신 광고 내용과 입력값을 확인해 주세요.",
    GOOGLE_ADS_PINNED_ASSETS_REQUIRED: "고정된 광고 제목·설명의 위치와 개수를 유지해야 합니다. 최신 내용을 다시 조회한 뒤 기존 항목의 문구만 수정해 주세요.",
    IDEMPOTENCY_CONFLICT: "같은 요청 ID에 다른 내용이 저장되어 있습니다. 기존 요청 상태를 확인해 주세요.",
    TEST_CAMPAIGNS_DISABLED: "현재 광고 수정이 비활성화되어 있습니다. 서비스 관리자에게 문의해 주세요.",
    GOOGLE_ADS_TEST_ACCOUNT_REQUIRED: "이 연결 계정은 수정 대상이 아닙니다. 광고계정 상태를 확인해 주세요.",
    CAMPAIGN_STORAGE_UNAVAILABLE: "요청을 안전하게 저장할 수 없어 전송을 중단했습니다. 브라우저 저장소를 확인해 주세요.",
    CAMPAIGN_RESPONSE_INVALID: "응답을 확인할 수 없습니다. 기존 수정 요청 상태를 다시 확인해 주세요.",
  };
  if (code && messages[code]) return messages[code];
  if (status === 401) return "로그인이 필요합니다. 다시 로그인해 주세요.";
  if (status === 403) return "광고 조회와 수정은 소유자, 관리자, 마케터만 가능합니다. 계정 접근 권한도 확인해 주세요.";
  return "광고 요청을 확인하지 못했습니다. 잠시 후 다시 조회해 주세요.";
}
export class ManagedApiError extends Error {
  constructor(public code?: string, public status?: number) { super(managedErrorMessage(code, status)); }
}

export function managedCampaignApi(workspaceId: string) {
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/integrations/google-ads/campaigns`;
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${base}/${path}`, { ...init, cache: "no-store", credentials: "same-origin" });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new ManagedApiError(object(value) && typeof value.code === "string" ? value.code : undefined, response.status);
    return value;
  }
  return {
    list: async (signal?: AbortSignal): Promise<ManagedCampaign[]> => {
      const value = await request("managed", { signal });
      if (!object(value) || !Array.isArray(value.items) || !value.items.every(isManagedCampaign) ||
        new Set(value.items.map((item) => item.creationRequestId.toLowerCase())).size !== value.items.length) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      return value.items;
    },
    discover: async (account: DiscoveryAccount, campaignId: string, signal?: AbortSignal): Promise<CampaignAds> => {
      if (!id(account.accountId) || !id(campaignId)) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      const value = await request(`accounts/${account.accountId}/${campaignId}/ads`, { signal });
      if (!isCampaignAds(value, account, campaignId)) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      return value;
    },
    details: async (id: string, signal?: AbortSignal): Promise<ManagedDetails> => {
      const value = await request(`managed/${encodeURIComponent(id)}`, { signal });
      if (!isManagedDetails(value) || value.creationRequestId.toLowerCase() !== id.toLowerCase()) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      return value;
    },
    update: async (id: string, input: AdUpdateInput): Promise<AdUpdateResult> => {
      const value = await request(`managed/${encodeURIComponent(id)}/updates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!isAdUpdateResult(value) || value.requestId !== input.requestId || value.creationRequestId.toLowerCase() !== id.toLowerCase()) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      return value;
    },
    lookup: async (id: string): Promise<AdUpdateResult> => {
      const value = await request(`updates/${encodeURIComponent(id)}`);
      if (!isAdUpdateResult(value) || value.requestId.toLowerCase() !== id.toLowerCase()) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      return value;
    },
  };
}

export function adUpdateStorageKey(userId: string, workspaceId: string, creationRequestId: string) {
  return `growdoads:ad-update:v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(creationRequestId.toLowerCase())}`;
}
export function parseAdUpdateDraft(text: string, creationRequestId: string): AdUpdateDraft | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!object(value) || Object.keys(value).length !== 4 || value.schema !== 1 ||
      typeof value.creationRequestId !== "string" || value.creationRequestId.toLowerCase() !== creationRequestId.toLowerCase() ||
      !creationUuid.test(value.creationRequestId) || typeof value.phase !== "string" || !["submitted", "applying", "applied", "failed", "unknown"].includes(value.phase) || !adUpdateInput(value.input)) return null;
    return value as AdUpdateDraft;
  } catch { return null; }
}
export const updateIsTerminal = (draft: AdUpdateDraft) => draft.phase === "applied" || draft.phase === "failed";
type UpdateApi = Pick<ReturnType<typeof managedCampaignApi>, "update" | "lookup">;
type Save = (draft: AdUpdateDraft) => void;

function settled(draft: AdUpdateDraft, result: AdUpdateResult, save: Save) {
  if (result.requestId.toLowerCase() !== draft.input.requestId.toLowerCase() || result.creationRequestId.toLowerCase() !== draft.creationRequestId.toLowerCase()) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
  const next: AdUpdateDraft = { ...draft, phase: result.status };
  save(next);
  return { draft: next, result, error: result.errorCode ? managedErrorMessage(result.errorCode) : "" };
}
export async function recoverAdUpdate(draft: AdUpdateDraft, api: UpdateApi, save: Save) {
  try { return settled(draft, await api.lookup(draft.input.requestId), save); }
  catch (cause) {
    const next: AdUpdateDraft = { ...draft, phase: updateIsTerminal(draft) ? draft.phase : "unknown" };
    save(next);
    return { draft: next, result: null, error: cause instanceof ManagedApiError ? cause.message : managedErrorMessage("GOOGLE_ADS_AD_UPDATE_UNKNOWN") };
  }
}
export async function submitAdUpdate(draft: AdUpdateDraft, api: UpdateApi, save: Save) {
  if (draft.phase !== "submitted") throw new Error("Ad update is locked");
  save(draft);
  try { return settled(draft, await api.update(draft.creationRequestId, draft.input), save); }
  catch (cause) {
    const failure = cause instanceof ManagedApiError ? cause : new ManagedApiError("GOOGLE_ADS_AD_UPDATE_UNKNOWN");
    const rejected = ["GOOGLE_ADS_AD_UPDATE_CONFLICT", "GOOGLE_ADS_PAUSED_REQUIRED", "GOOGLE_ADS_KEYWORD_REMOVAL_CONSENT_REQUIRED", "GOOGLE_ADS_AD_UPDATE_REJECTED", "GOOGLE_ADS_PINNED_ASSETS_REQUIRED"].includes(failure.code ?? "");
    const next: AdUpdateDraft = { ...draft, phase: rejected ? "failed" : "unknown" };
    save(next);
    if (rejected) return { draft: next, result: null, error: failure.message };
    const recovered = await recoverAdUpdate(next, api, save);
    return { ...recovered, error: recovered.error || (updateIsTerminal(recovered.draft) ? "" : failure.message) };
  }
}

export function managedSearchAdFields(value: ManagedDetails): SearchAdFields | null {
  const ad = value.details;
  const matchType = ad.keywords[0]?.matchType ?? "EXACT";
  if (value.readonlyReason || ad.readonlyReason || !value.canEdit || ad.finalUrls.length !== 1 || !["EXACT", "PHRASE", "BROAD"].includes(matchType) ||
    ad.keywords.some((keyword) => keyword.matchType !== matchType || unsafeAdText.test(keyword.text))) return null;
  return { adGroupName: ad.adGroupName, bid: campaignBudgetText(ad.cpcBidMicros), finalUrl: ad.finalUrls[0] ?? "",
    headlines: [...ad.headlines], descriptions: [...ad.descriptions], keywords: ad.keywords.map((keyword) => keyword.text).join("\n"),
    keywordMatchType: matchType };
}
export function managedReadonlyReason(value: ManagedDetails) {
  if (value.readonlyReason) return value.readonlyReason;
  if (value.details.readonlyReason) return value.details.readonlyReason;
  if (!managedIsPaused(value)) return managedErrorMessage("GOOGLE_ADS_PAUSED_REQUIRED");
  if (!value.canEdit) return "현재 광고는 읽기 전용입니다. 최신 내용과 처리 중인 요청을 확인해 주세요.";
  if (!managedSearchAdFields(value)) return "현재 광고의 URL·키워드·광고 문구 구성은 이 편집기에서 수정할 수 없습니다. Google 저장 내용을 확인해 주세요.";
  return "";
}
export function managedDetailsMatch(value: ManagedDetails, campaign: ManagedCampaign, adResourceName?: string) {
  return value.accountId === campaign.accountId && value.campaignId === campaign.campaignId && value.currency === campaign.currency &&
    value.details.adGroupId === campaign.adGroupId && value.details.adResourceName.split("/")[1] === campaign.customerId &&
    (!adResourceName || value.details.adResourceName === adResourceName);
}
export function removedKeywords(details: CampaignDetails, fields: SearchAdFields) {
  const texts = new Set(fields.keywords.split(/\r?\n/).map((text) => text.trim()).filter(Boolean));
  return details.keywords.filter((keyword) => keyword.matchType !== fields.keywordMatchType || !texts.has(keyword.text));
}
export function managedIsPaused(value: ManagedDetails) {
  return [value.details.campaignStatus, value.details.adGroupStatus, value.details.adStatus, ...value.details.keywords.map((keyword) => keyword.status)].every((status) => status === "PAUSED");
}
