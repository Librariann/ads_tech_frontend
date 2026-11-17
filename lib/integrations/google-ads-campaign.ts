import type { GoogleAdsReport, ReportAccount } from "./google-ads-report";
import { searchAdInput, unsafeAdText, type SearchAd } from "./google-ads-search-ad";

export const campaignUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$(?![\s\S])/i;
export const campaignIdPattern = /^[1-9]\d*$(?![\s\S])/;
const maximumMicros = BigInt("1000000000000");

export type CampaignInput = {
  requestId: string;
  accountId: string;
  name: string;
  dailyBudgetMicros: string;
  searchAd?: SearchAd;
};

export type CampaignResult = Omit<CampaignInput, "searchAd"> & {
  searchAd: SearchAd | null;
  adGroupId: string | null;
  adResourceName: string | null;
  keywordResourceNames: string[];
  status: "creating" | "created" | "unknown" | "failed";
  currency: string | null;
  customerId: string;
  campaignId: string | null;
  budgetResourceName: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export function validCampaignMicros(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,12}$(?![\s\S])/.test(value) && BigInt(value) <= maximumMicros;
}

export function parseDailyBudget(value: string): string | null {
  const text = value.trim();
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const micros = (BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0"))).toString();
  return validCampaignMicros(micros) ? micros : null;
}

export function campaignBudgetText(micros: string) {
  if (!validCampaignMicros(micros)) return "";
  const value = BigInt(micros);
  const fraction = (value % BigInt(1000000)).toString().padStart(6, "0").replace(/0+$/, "");
  return `${value / BigInt(1000000)}${fraction ? `.${fraction}` : ""}`;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Shared by the form, persisted drafts, and the BFF. No provider settings are accepted.
export function campaignInput(value: unknown): CampaignInput | null {
  if (!object(value) || ![4, 5].includes(Object.keys(value).length) ||
    Object.keys(value).some((key) => !["requestId", "accountId", "name", "dailyBudgetMicros", "searchAd"].includes(key)) ||
    !["requestId", "accountId", "name", "dailyBudgetMicros"].every((key) => Object.hasOwn(value, key)) ||
    typeof value.requestId !== "string" || !campaignUuidPattern.test(value.requestId) ||
    typeof value.accountId !== "string" || !campaignIdPattern.test(value.accountId) ||
    typeof value.name !== "string" || /[\u0000-\u001f\u007f-\u009f]/.test(value.name) || !value.name.trim() || value.name.trim().length > 128 ||
    !validCampaignMicros(value.dailyBudgetMicros)) return null;
  const hasSearchAd = Object.hasOwn(value, "searchAd");
  const searchAd = hasSearchAd ? searchAdInput(value.searchAd) : null;
  if (hasSearchAd && (!searchAd || unsafeAdText.test(value.name))) return null;
  return {
    requestId: value.requestId.toLowerCase(), accountId: value.accountId,
    name: value.name.trim(), dailyBudgetMicros: value.dailyBudgetMicros,
    ...(searchAd ? { searchAd } : {}),
  };
}

export function isCampaignResult(value: unknown): value is CampaignResult {
  if (!object(value) || !campaignInput({
    requestId: value.requestId, accountId: value.accountId,
    name: value.name, dailyBudgetMicros: value.dailyBudgetMicros,
  })) return false;
  const searchAd = value.searchAd === null ? null : searchAdInput(value.searchAd);
  if (value.searchAd !== null && !searchAd) return false;
  if (!Array.isArray(value.keywordResourceNames) ||
    !value.keywordResourceNames.every((resource) => validAdResource(resource, value.customerId, value.adGroupId, "adGroupCriteria")) ||
    new Set(value.keywordResourceNames).size !== value.keywordResourceNames.length) return false;
  if (value.adGroupId !== null && (typeof value.adGroupId !== "string" || !campaignIdPattern.test(value.adGroupId))) return false;
  if (value.adResourceName !== null && !validAdResource(value.adResourceName, value.customerId, value.adGroupId, "adGroupAds")) return false;
  if (!searchAd && (value.adGroupId !== null || value.adResourceName !== null || value.keywordResourceNames.length)) return false;
  if (searchAd && (value.keywordResourceNames.length > searchAd.keywords.length ||
    (value.status === "created" && (value.adGroupId === null || value.adResourceName === null || value.keywordResourceNames.length !== searchAd.keywords.length)))) return false;
  const validBudgetResource = typeof value.budgetResourceName === "string" &&
    /^customers\/\d{10}\/campaignBudgets\/[1-9]\d*$(?![\s\S])/.test(value.budgetResourceName) &&
    value.budgetResourceName.startsWith(`customers/${value.customerId}/campaignBudgets/`);
  return typeof value.status === "string" && ["creating", "created", "unknown", "failed"].includes(value.status) &&
    (value.currency === null || (typeof value.currency === "string" && /^[A-Z]{3}$(?![\s\S])/.test(value.currency))) &&
    typeof value.customerId === "string" && /^\d{10}$(?![\s\S])/.test(value.customerId) &&
    (value.campaignId === null || (typeof value.campaignId === "string" && campaignIdPattern.test(value.campaignId))) &&
    (value.budgetResourceName === null || validBudgetResource) &&
    (value.errorCode === null || typeof value.errorCode === "string") &&
    (value.status !== "created" || (value.campaignId !== null && validBudgetResource && value.currency !== null && value.errorCode === null)) &&
    ["createdAt", "updatedAt"].every((key) => typeof value[key] === "string" && Number.isFinite(Date.parse(value[key] as string)));
}

function validAdResource(value: unknown, customerId: unknown, adGroupId: unknown, collection: string): value is string {
  return typeof value === "string" && typeof customerId === "string" && typeof adGroupId === "string" &&
    new RegExp(`^customers/\\d{10}/${collection}/[1-9]\\d*~[1-9]\\d*$(?![\\s\\S])`).test(value) &&
    value.startsWith(`customers/${customerId}/${collection}/${adGroupId}~`);
}

export type CampaignDetails = {
  campaignId: string;
  adGroupId: string;
  adGroupStatus: string;
  adStatus: string;
  adResourceName: string;
  finalUrls: string[];
  headlines: string[];
  descriptions: string[];
  cpcBidMicros: string;
  keywords: { text: string; matchType: "EXACT" | "PHRASE" | "BROAD"; status: string; resourceName: string }[];
  fetchedAt: string;
};

export function isCampaignDetails(value: unknown): value is CampaignDetails {
  if (!object(value) || typeof value.campaignId !== "string" || !campaignIdPattern.test(value.campaignId) ||
    typeof value.adGroupId !== "string" || !campaignIdPattern.test(value.adGroupId) ||
    typeof value.adResourceName !== "string") return false;
  const customerId = value.adResourceName.split("/")[1];
  const status = (item: unknown) => typeof item === "string" && ["PAUSED", "ENABLED", "REMOVED", "UNKNOWN", "UNSPECIFIED"].includes(item);
  const strings = (items: unknown) => Array.isArray(items) && items.every((item) => typeof item === "string");
  return validAdResource(value.adResourceName, customerId, value.adGroupId, "adGroupAds") &&
    status(value.adGroupStatus) && status(value.adStatus) &&
    strings(value.finalUrls) && strings(value.headlines) && strings(value.descriptions) &&
    validCampaignMicros(value.cpcBidMicros) && Array.isArray(value.keywords) &&
    value.keywords.every((keyword) => object(keyword) && typeof keyword.text === "string" &&
      typeof keyword.matchType === "string" && ["EXACT", "PHRASE", "BROAD"].includes(keyword.matchType) && status(keyword.status) &&
      validAdResource(keyword.resourceName, customerId, value.adGroupId, "adGroupCriteria")) &&
    new Set(value.keywords.map((keyword) => keyword.resourceName)).size === value.keywords.length &&
    typeof value.fetchedAt === "string" && Number.isFinite(Date.parse(value.fetchedAt));
}

export function campaignAccounts(report: GoogleAdsReport): ReportAccount[] {
  return report.accounts.filter((account) => account.status === "ok" && account.testAccount === true &&
    campaignIdPattern.test(account.accountId) && /^[A-Z]{3}$/.test(account.currency));
}

export function canCreateCampaign(role: string) {
  return ["owner", "admin", "marketer"].includes(role);
}

export function campaignErrorMessage(code?: string, status?: number) {
  const messages: Record<string, string> = {
    TEST_CAMPAIGNS_DISABLED: "캠페인 생성이 비활성화되어 있습니다. 서비스 관리자에게 문의해 주세요.",
    GOOGLE_ADS_TEST_ACCOUNT_REQUIRED: "현재 생성 가능한 연결 계정만 사용할 수 있습니다. 광고계정 상태를 확인해 주세요.",
    GOOGLE_ADS_CAMPAIGN_REQUEST_CONFLICT: "저장된 요청과 입력 내용이 다릅니다. 요청 상세와 보고서를 확인해 주세요.",
    GOOGLE_ADS_CAMPAIGN_PENDING: "캠페인 생성 요청이 처리 중입니다. 저장된 요청 상태를 확인해 주세요.",
    GOOGLE_ADS_CAMPAIGN_RESULT_UNKNOWN: "Google 생성 결과를 확인하지 못했습니다. 새로 요청하지 말고 요청 상세와 보고서를 대조해 주세요.",
    GOOGLE_ADS_REAUTH_REQUIRED: "Google 재인증이 필요합니다. 소유자 또는 관리자에게 광고계정 재연결을 요청해 주세요.",
    GOOGLE_ADS_CAMPAIGN_REJECTED: "Google에서 캠페인 생성을 거부했습니다. 요청 상세의 계정, 캠페인 이름과 예산을 확인한 뒤 관리자에게 문의해 주세요.",
    GOOGLE_ADS_PERMISSION_DENIED: "Google 광고계정 접근 권한이 부족합니다. 소유자 또는 관리자에게 계정 권한 확인을 요청해 주세요.",
    GOOGLE_ADS_RATE_LIMITED: "Google Ads 요청 한도에 도달했습니다. 잠시 후 저장된 요청 상태를 다시 확인해 주세요.",
    GOOGLE_ADS_UPSTREAM_UNAVAILABLE: "Google Ads에 연결할 수 없습니다. 새로 생성하지 말고 잠시 후 저장된 요청 상태를 확인해 주세요.",
    GOOGLE_ADS_UPSTREAM_ERROR: "Google Ads 응답을 확인하지 못했습니다. 저장된 요청 상태와 보고서를 확인해 주세요.",
    ACTIVE_SUBSCRIPTION_REQUIRED: "이용 가능한 구독이 필요합니다. 워크스페이스의 플랜 상태를 확인해 주세요.",
    ENTITLEMENT_LIMIT_EXCEEDED: "현재 플랜의 이용 한도에 도달했습니다. 워크스페이스의 플랜 상태를 확인해 주세요.",
    CAMPAIGN_STORAGE_UNAVAILABLE: "요청을 안전하게 저장할 수 없어 전송을 중단했습니다. 브라우저 저장소 사용 여부를 확인해 주세요.",
    CAMPAIGN_RESPONSE_INVALID: "응답을 확인할 수 없습니다. 저장된 요청 상태와 보고서를 확인해 주세요.",
  };
  if (code && messages[code]) return messages[code];
  if (status === 401) return "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
  if (status === 403) return "캠페인 생성은 소유자, 관리자, 마케터만 가능합니다. 계정 접근 권한도 확인해 주세요.";
  return "요청 결과를 확인하지 못했습니다. 저장된 요청 상태를 확인해 주세요.";
}

export class CampaignApiError extends Error {
  constructor(public code?: string, public status?: number) {
    super(campaignErrorMessage(code, status));
  }
}

export function campaignApi(workspaceId: string) {
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/integrations/google-ads/campaigns`;
  async function request(path: string, init?: RequestInit): Promise<CampaignResult> {
    const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store" });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new CampaignApiError(object(value) && typeof value.code === "string" ? value.code : undefined, response.status);
    if (!isCampaignResult(value)) throw new CampaignApiError("CAMPAIGN_RESPONSE_INVALID");
    return value;
  }
  return {
    create: (input: CampaignInput) => request(base, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }),
    lookup: (requestId: string) => request(`${base}/requests/${encodeURIComponent(requestId)}`),
    details: async (requestId: string): Promise<CampaignDetails> => {
      const response = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/details`, { credentials: "same-origin", cache: "no-store" });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new CampaignApiError(object(value) && typeof value.code === "string" ? value.code : undefined, response.status);
      if (!isCampaignDetails(value)) throw new CampaignApiError("CAMPAIGN_RESPONSE_INVALID");
      return value;
    },
  };
}

export type CampaignDraft = {
  version: 1;
  input: CampaignInput;
  phase: "submitted" | "retryable" | "creating" | "unknown" | "conflict" | "created" | "failed";
};
export type CampaignRequestState = { draft: CampaignDraft; result: CampaignResult | null; error: string; loginRequired?: boolean };
type CampaignApi = Pick<ReturnType<typeof campaignApi>, "create" | "lookup">;
type SaveDraft = (draft: CampaignDraft) => void;

export function campaignStorageKey(workspaceId: string, userId: string) {
  return `growdoads:campaign:v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`;
}

export function parseCampaignDraft(text: string): CampaignDraft | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!object(value) || value.version !== 1 ||
      !["submitted", "retryable", "creating", "unknown", "conflict", "created", "failed"].includes(String(value.phase))) return null;
    if (!campaignInput(value.input)) return null;
    // Validation must not rewrite a persisted intent or add searchAd to legacy hashes.
    return { version: 1, input: value.input as CampaignInput, phase: value.phase as CampaignDraft["phase"] };
  } catch { return null; }
}

function settleCampaign(draft: CampaignDraft, result: CampaignResult, save: SaveDraft): CampaignRequestState {
  if (result.requestId.toLowerCase() !== draft.input.requestId.toLowerCase()) throw new CampaignApiError("CAMPAIGN_RESPONSE_INVALID");
  const matching = result.accountId === draft.input.accountId && result.name === draft.input.name.trim() && result.dailyBudgetMicros === draft.input.dailyBudgetMicros &&
    JSON.stringify(result.searchAd ? searchAdInput(result.searchAd) : null) === JSON.stringify(draft.input.searchAd ? searchAdInput(draft.input.searchAd) : null);
  // Once Google reports an uncertain outcome, only an authoritative terminal result unlocks a new intent.
  const phase = !matching ? "conflict" : draft.phase === "unknown" && result.status === "creating" ? "unknown" : result.status;
  const next: CampaignDraft = { ...draft, phase };
  save(next);
  return { draft: next, result, error: phase === "conflict" ? campaignErrorMessage("GOOGLE_ADS_CAMPAIGN_REQUEST_CONFLICT") : "" };
}

export async function recoverCampaign(draft: CampaignDraft, api: CampaignApi, save: SaveDraft): Promise<CampaignRequestState> {
  try {
    return settleCampaign(draft, await api.lookup(draft.input.requestId), save);
  } catch (cause) {
    const failure = cause instanceof CampaignApiError ? cause : new CampaignApiError();
    const phase = failure.code === "GOOGLE_ADS_CAMPAIGN_RESULT_UNKNOWN" ? "unknown"
      : failure.code === "GOOGLE_ADS_CAMPAIGN_PENDING" ? "creating"
      : failure.code === "GOOGLE_ADS_CAMPAIGN_REQUEST_CONFLICT" ? "conflict"
      : failure.status === 404 && ["submitted", "retryable"].includes(draft.phase) ? "retryable" : draft.phase;
    const next = { ...draft, phase };
    save(next);
    return {
      draft: next, result: null, loginRequired: failure.status === 401 && failure.code !== "GOOGLE_ADS_REAUTH_REQUIRED",
      error: phase === "retryable" && failure.status === 404
        ? "저장된 요청이 서버에서 조회되지 않았습니다. 같은 요청 ID와 내용으로만 다시 전송할 수 있습니다."
        : failure.message,
    };
  }
}

export async function submitCampaign(draft: CampaignDraft, api: CampaignApi, save: SaveDraft): Promise<CampaignRequestState> {
  if (!["submitted", "retryable"].includes(draft.phase)) throw new Error("Campaign request is locked");
  const pending: CampaignDraft = { ...draft, phase: "submitted" };
  // Persistence must succeed before a POST; a reload must never silently create another key.
  save(pending);
  try {
    return settleCampaign(pending, await api.create(pending.input), save);
  } catch (cause) {
    const failure = cause instanceof CampaignApiError ? cause : new CampaignApiError();
    const phase = failure.code === "GOOGLE_ADS_CAMPAIGN_RESULT_UNKNOWN" ? "unknown"
      : failure.code === "GOOGLE_ADS_CAMPAIGN_PENDING" ? "creating"
      : failure.code === "GOOGLE_ADS_CAMPAIGN_REQUEST_CONFLICT" ? "conflict" : "submitted";
    const next: CampaignDraft = { ...pending, phase };
    save(next);
    const recovered = await recoverCampaign(next, api, save);
    return { ...recovered, error: recovered.error ? `${failure.message} ${recovered.error}` : recovered.error };
  }
}

export function canStartNewCampaign(draft: CampaignDraft) {
  return draft.phase === "created" || draft.phase === "failed";
}
