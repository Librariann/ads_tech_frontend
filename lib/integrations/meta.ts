export function isMetaId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,18}$(?![\s\S])/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}
const externalIdPattern = /^\d{1,40}$(?![\s\S])/;
const integerPattern = /^\d{1,80}$(?![\s\S])/;
const decimalPattern = /^\d{1,80}(?:\.\d{1,20})?$(?![\s\S])/;
export type MetaConfiguration = { configured: boolean; missing: string[] };
export type MetaConnection = { id: string; status: string; tokenExpiresAt: string | null; createdAt: string };
export type MetaAvailableAccount = { externalAccountId: string; name: string; currency: string; timezone: string; accountStatus: number };
export type MetaAccount = Omit<MetaAvailableAccount, "accountStatus"> & { id: string; connectionId: string; platform: "meta_ads"; status: string };
export type MetaMetrics = { impressions: string; clicks: string; spend: string; reach: string | null };
export type MetaReport = {
  platform: "meta";
  account: Pick<MetaAccount, "id" | "externalAccountId" | "name" | "currency" | "timezone">;
  dateFrom: string; dateTo: string; fetchedAt: string;
  campaigns: { id: string; name: string; status: string; effectiveStatus: string; objective: string; dailyBudget: string | null; lifetimeBudget: string | null; metrics: MetaMetrics }[];
  totals: MetaMetrics;
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
export function isMetaConfiguration(value: unknown): value is MetaConfiguration {
  return record(value) && typeof value.configured === "boolean" && Array.isArray(value.missing) && value.missing.every(text);
}
export function safeMetaMissingNames(names: string[]) {
  const allowed = ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI", "META_OAUTH_REDIRECT_URI", "META_GRAPH_API_VERSION", "META_API_VERSION", "META_TOKEN_ENCRYPTION_KEY"];
  return names.filter((name) => allowed.includes(name));
}
export function isMetaConnections(value: unknown): value is MetaConnection[] {
  return Array.isArray(value) && value.every((c) => record(c) && isMetaId(c.id) && text(c.status) &&
    (c.tokenExpiresAt === null || text(c.tokenExpiresAt)) && text(c.createdAt));
}
export function isMetaAvailableAccounts(value: unknown): value is MetaAvailableAccount[] {
  return Array.isArray(value) && value.every((a) => record(a) && text(a.externalAccountId) && externalIdPattern.test(a.externalAccountId) &&
    [a.name, a.currency, a.timezone].every(text) && Number.isInteger(a.accountStatus));
}
export function isMetaAccounts(value: unknown): value is MetaAccount[] {
  return Array.isArray(value) && value.every((a) => record(a) && a.platform === "meta_ads" &&
    [a.id, a.connectionId, a.externalAccountId, a.name, a.currency, a.timezone, a.status].every(text) &&
    isMetaId(a.id) && isMetaId(a.connectionId) && externalIdPattern.test(a.externalAccountId as string));
}

export function canManageMeta(role: string) { return role === "owner" || role === "admin"; }

export function metaDateError(dateFrom: string, dateTo: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(dateFrom) || !valid(dateTo)) return "조회 시작일과 종료일을 확인해 주세요.";
  const days = (Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000 + 1;
  return days < 1 || days > 92 ? "조회 기간은 시작일부터 최대 92일입니다." : null;
}

export function metaReportQuery(query: URLSearchParams) {
  if ([...query.keys()].some((key) => !["accountId", "dateFrom", "dateTo"].includes(key))) return null;
  for (const key of ["accountId", "dateFrom", "dateTo"]) if (query.getAll(key).length > 1) return null;
  const accountId = query.get("accountId");
  if (!isMetaId(accountId)) return null;
  const from = query.get("dateFrom"), to = query.get("dateTo");
  if ((from !== null || to !== null) && (!from || !to || metaDateError(from, to))) return null;
  const result = new URLSearchParams({ accountId });
  if (from && to) { result.set("dateFrom", from); result.set("dateTo", to); }
  return result.toString();
}

export function metaAccountInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || !isMetaId(data.connectionId) ||
    typeof data.externalAccountId !== "string" || !externalIdPattern.test(data.externalAccountId)) return null;
  return { connectionId: data.connectionId, externalAccountId: data.externalAccountId };
}

export function metaConnectionNeedsAuth(connection: MetaConnection, now = Date.now()) {
  return connection.status !== "active" || (connection.tokenExpiresAt !== null &&
    (!Number.isFinite(Date.parse(connection.tokenExpiresAt)) || Date.parse(connection.tokenExpiresAt) <= now + 60_000));
}

export class MetaApiError extends Error {
  constructor(public status: number, public code?: string) { super(metaErrorMessage(status, code)); }
}

export function metaErrorMessage(status = 0, code?: string) {
  if (code === "META_ADS_REAUTH_REQUIRED") return "Meta 인증이 만료되었거나 유효하지 않습니다. Meta 계정을 다시 연결해 주세요. 앱 로그인은 유지됩니다.";
  if (status === 401) return "로그인 세션을 확인하지 못했습니다. 페이지를 새로고침한 뒤 다시 로그인해 주세요.";
  if (code === "META_ADS_NOT_CONFIGURED") return "Meta 연결 설정이 아직 준비되지 않았습니다. 서비스 관리자에게 설정 완료를 요청해 주세요.";
  if (code === "ENTITLEMENT_LIMIT_EXCEEDED") return "현재 구독의 광고계정 등록 한도에 도달했습니다. 구독과 등록된 계정을 확인해 주세요.";
  if (status === 402 || code === "ACTIVE_SUBSCRIPTION_REQUIRED") return "광고계정 등록에 활성 구독이 필요합니다. 워크스페이스 구독을 확인해 주세요.";
  if (status === 403 || code === "META_ADS_PERMISSION_REQUIRED") return "Meta 조회 권한이 없습니다. 워크스페이스 권한과 Meta 광고계정 접근 권한을 관리자에게 확인해 주세요.";
  if (status === 429 || code === "META_ADS_RATE_LIMITED") return "Meta 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  return "Meta 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function metaRequest<T>(workspaceId: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/integrations/meta/${path}`, {
    ...init, cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new MetaApiError(response.status, typeof payload?.code === "string" ? payload.code : undefined);
  if (payload === null) throw new MetaApiError(502);
  return payload as T;
}

export function metaAuthorizationUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.facebook.com", "facebook.com"].includes(url.hostname) &&
      !url.username && !url.password && !url.port && /^\/(?:v\d+\.\d+\/)?dialog\/oauth\/?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function formatMetaInteger(value: string | null) {
  return value !== null && integerPattern.test(value) ? BigInt(value).toLocaleString("ko-KR") : "미제공";
}

export function formatMetaMoney(value: string | null, currency: string) {
  if (value === null || !decimalPattern.test(value) || !/^[A-Z]{3}$/.test(currency)) return "미제공";
  const formatter = new Intl.NumberFormat("ko-KR", { style: "currency", currency, currencyDisplay: "code" });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const [whole, fraction = ""] = value.split(".");
  // Round with integer arithmetic, including values beyond Number's safe range.
  let scaled = BigInt(whole) * BigInt(10) ** BigInt(digits) + BigInt(fraction.slice(0, digits).padEnd(digits, "0") || "0");
  if (Number(fraction[digits] ?? "0") >= 5) scaled += BigInt(1);
  const scale = BigInt(10) ** BigInt(digits);
  const grouped = (scaled / scale).toLocaleString("ko-KR");
  return `${currency} ${grouped}${digits ? `.${(scaled % scale).toString().padStart(digits, "0")}` : ""}`;
}

export function formatMetaTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "미제공";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function isMetaReport(value: unknown): value is MetaReport {
  if (!value || typeof value !== "object") return false;
  const report = value as MetaReport;
  const text = (v: unknown) => typeof v === "string";
  const integer = (v: unknown) => text(v) && integerPattern.test(v as string);
  const metrics = (v: MetaMetrics) => v && integer(v.impressions) && integer(v.clicks) && text(v.spend) &&
    decimalPattern.test(v.spend) && (v.reach === null || integer(v.reach));
  return report.platform === "meta" && !!report.account && isMetaId(report.account.id) && externalIdPattern.test(report.account.externalAccountId) &&
    [report.account.externalAccountId, report.account.name, report.account.timezone].every(text) && /^[A-Z]{3}$/.test(report.account.currency) &&
    !metaDateError(report.dateFrom, report.dateTo) && text(report.fetchedAt) && Number.isFinite(Date.parse(report.fetchedAt)) &&
    !!metrics(report.totals) && Array.isArray(report.campaigns) && report.campaigns.every((c) =>
      c && [c.id, c.name, c.status, c.effectiveStatus, c.objective].every(text) &&
      (c.dailyBudget === null || text(c.dailyBudget)) && (c.lifetimeBudget === null || text(c.lifetimeBudget)) && metrics(c.metrics));
}
