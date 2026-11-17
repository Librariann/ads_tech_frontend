export type NaverConfiguration = { configured: boolean };
export type NaverAccount = {
  id: string;
  connectionId: string;
  platform: "naver_ads";
  externalAccountId: string;
  name: string;
  currency: "KRW";
  timezone: "Asia/Seoul";
  status: string;
  connectionStatus: string;
};
type NaverAccountSummary = Pick<NaverAccount, "id" | "externalAccountId" | "name" | "currency" | "timezone">;
export type NaverCampaign = {
  id: string;
  name: string;
  status: string;
  campaignType: string;
  dailyBudget: string | null;
  impressions: string | null;
  clicks: string | null;
  cost: string | null;
};
export type NaverReport = {
  account: NaverAccountSummary;
  period: { dateFrom: string; dateTo: string };
  campaigns: NaverCampaign[];
  totals: { impressions: string | null; clicks: string | null; cost: string | null };
  fetchedAt: string;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const digits = (value: unknown): value is string => text(value) && /^\d{1,80}$/.test(value) && !/\s/.test(value);
const decimal = (value: unknown): value is string => text(value) && /^\d{1,80}(?:\.\d{1,20})?$/.test(value) && !/\s/.test(value);
const customerId = (value: unknown): value is string => text(value) && /^[1-9]\d{0,14}$/.test(value) && !/\s/.test(value);

export function isNaverId(value: unknown): value is string {
  return text(value) && /^[1-9]\d{0,18}$/.test(value) && !/\s/.test(value) &&
    BigInt(value) <= BigInt("9223372036854775807");
}

export function canManageNaver(role: string) { return role === "owner" || role === "admin"; }

export function naverAccountInput(value: unknown) {
  if (!record(value) || Object.keys(value).length !== 4 || !customerId(value.customerId) ||
    !text(value.name) || value.name.length < 1 || value.name.length > 160 || !value.name.trim()) return null;
  const credential = (v: unknown): v is string => text(v) && v.length >= 1 && v.length <= 512 && !/[^\x21-\x7e]/.test(v);
  if (!credential(value.apiKey) || !credential(value.secretKey)) return null;
  return { customerId: value.customerId, name: value.name, apiKey: value.apiKey, secretKey: value.secretKey };
}

export function naverToday(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function naverDateError(dateFrom: string, dateTo: string, now = Date.now()) {
  if (!dateFrom && !dateTo) return null;
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !/\s/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid(dateFrom) || !valid(dateTo)) return "조회 시작일과 종료일을 모두 확인해 주세요.";
  if (dateFrom > naverToday(now) || dateTo > naverToday(now)) return "한국 시간 기준 오늘 이후의 날짜는 조회할 수 없습니다.";
  const days = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000 + 1;
  return days < 1 || days > 31 ? "조회 기간은 시작일과 종료일을 포함해 최대 31일입니다." : null;
}

export function naverReportQuery(query: URLSearchParams) {
  const keys = ["accountId", "dateFrom", "dateTo"];
  if ([...query.keys()].some((key) => !keys.includes(key)) || keys.some((key) => query.getAll(key).length > 1)) return null;
  const accountId = query.get("accountId");
  if (!isNaverId(accountId)) return null;
  const from = query.get("dateFrom"), to = query.get("dateTo");
  if ((from !== null || to !== null) && (!from || !to || naverDateError(from, to))) return null;
  const result = new URLSearchParams({ accountId });
  if (from && to) { result.set("dateFrom", from); result.set("dateTo", to); }
  return result.toString();
}

// Parse into explicit public fields so extra upstream fields never reach the browser.
export function parseNaverConfiguration(value: unknown): NaverConfiguration | null {
  return record(value) && typeof value.configured === "boolean" ? { configured: value.configured } : null;
}

function parseAccountSummary(value: unknown): NaverAccountSummary | null {
  if (!record(value) || !isNaverId(value.id) || !customerId(value.externalAccountId) || !text(value.name) ||
    value.currency !== "KRW" || value.timezone !== "Asia/Seoul") return null;
  return { id: value.id, externalAccountId: value.externalAccountId, name: value.name, currency: value.currency, timezone: value.timezone };
}

export function parseNaverAccounts(value: unknown): NaverAccount[] | null {
  if (!Array.isArray(value)) return null;
  const result: NaverAccount[] = [];
  for (const item of value) {
    const account = parseAccountSummary(item);
    if (!account || !record(item) || !isNaverId(item.connectionId) || item.platform !== "naver_ads" ||
      !text(item.status) || !text(item.connectionStatus)) return null;
    result.push({ ...account, connectionId: item.connectionId, platform: "naver_ads", status: item.status, connectionStatus: item.connectionStatus });
  }
  return result;
}

export function parseNaverReport(value: unknown): NaverReport | null {
  if (!record(value)) return null;
  const account = parseAccountSummary(value.account);
  if (!account || !record(value.period) || !text(value.period.dateFrom) || !text(value.period.dateTo) ||
    !value.period.dateFrom || !value.period.dateTo || naverDateError(value.period.dateFrom, value.period.dateTo) ||
    !text(value.fetchedAt) || !Number.isFinite(Date.parse(value.fetchedAt)) || !record(value.totals) ||
    !(value.totals.impressions === null || digits(value.totals.impressions)) ||
    !(value.totals.clicks === null || digits(value.totals.clicks)) ||
    !(value.totals.cost === null || decimal(value.totals.cost)) || !Array.isArray(value.campaigns)) return null;
  const campaigns: NaverCampaign[] = [];
  for (const c of value.campaigns) {
    if (!record(c) || ![c.id, c.name, c.status, c.campaignType].every(text) ||
      !(c.dailyBudget === null || decimal(c.dailyBudget)) || !(c.impressions === null || digits(c.impressions)) ||
      !(c.clicks === null || digits(c.clicks)) || !(c.cost === null || decimal(c.cost))) return null;
    campaigns.push({ id: c.id as string, name: c.name as string, status: c.status as string, campaignType: c.campaignType as string,
      dailyBudget: c.dailyBudget, impressions: c.impressions, clicks: c.clicks, cost: c.cost });
  }
  return { account, period: { dateFrom: value.period.dateFrom, dateTo: value.period.dateTo }, campaigns,
    totals: { impressions: value.totals.impressions, clicks: value.totals.clicks, cost: value.totals.cost }, fetchedAt: value.fetchedAt };
}

export const NAVER_SAFE_ERROR_CODES = [
  "NAVER_ADS_NOT_CONFIGURED", "NAVER_ADS_AUTH_FAILED", "NAVER_ADS_RATE_LIMITED", "NAVER_ADS_UNAVAILABLE",
  "ENTITLEMENT_LIMIT_EXCEEDED", "ACTIVE_SUBSCRIPTION_REQUIRED",
] as const;

export function naverErrorMessage(status = 0, code?: string) {
  if (code === "NAVER_ADS_NOT_CONFIGURED") return "네이버 검색광고 연결 설정이 아직 준비되지 않았습니다. 서비스 관리자에게 설정 완료를 요청해 주세요.";
  if (code === "NAVER_ADS_AUTH_FAILED") return "네이버 검색광고 인증을 확인하지 못했습니다. 고객 ID와 API 키, Secret 키를 확인하고 다시 등록해 주세요. 앱 로그인은 유지됩니다.";
  if (code === "ENTITLEMENT_LIMIT_EXCEEDED") return "현재 구독의 광고계정 등록 한도에 도달했습니다. 구독과 등록된 계정을 확인해 주세요.";
  if (code === "ACTIVE_SUBSCRIPTION_REQUIRED" || status === 402) return "광고계정 등록에 활성 구독이 필요합니다. 워크스페이스 구독을 확인해 주세요.";
  if (code === "NAVER_ADS_RATE_LIMITED" || status === 429) return "네이버 검색광고 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "NAVER_ADS_UNAVAILABLE") return "네이버 검색광고에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  if (status === 401) return "로그인 세션을 확인하지 못했습니다. 페이지를 새로고침한 뒤 다시 로그인해 주세요.";
  if (status === 403) return "요청 권한이 없습니다. 계정 등록은 워크스페이스 소유자 또는 관리자에게 요청해 주세요.";
  return "네이버 검색광고 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export class NaverApiError extends Error {
  constructor(public status: number, public code?: string) { super(naverErrorMessage(status, code)); }
}

export async function naverRequest(workspaceId: string, path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/integrations/naver/${path}`, {
    ...init, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new NaverApiError(response.status, record(payload) && text(payload.code) ? payload.code : undefined);
  if (payload === null) throw new NaverApiError(502);
  return payload;
}

export function formatNaverInteger(value: string | null) {
  return digits(value) ? BigInt(value).toLocaleString("ko-KR") : "-";
}

export function formatNaverMoney(value: string | null) {
  if (!decimal(value)) return "-";
  const [whole, fraction] = value.split(".");
  return `${BigInt(whole).toLocaleString("ko-KR")}${fraction ? `.${fraction}` : ""}원`;
}

export function formatNaverTime(value: string) {
  return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul",
  }).format(new Date(value)) : "미제공";
}
