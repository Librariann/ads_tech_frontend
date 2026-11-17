export type ReportMetrics = {
  impressions: number;
  clicks: number;
  costMicros: string;
  conversions: number;
  conversionValue: number;
  ctr: number | null;
  averageCpc: number | null;
  costPerConversion: number | null;
  roas: number | null;
};

export type ReportDaily = ReportMetrics & { date: string };
export type ReportCampaign = {
  id: string;
  name: string;
  status: string;
  primaryStatus: string;
  channel: string;
  budgetMicros: string | null;
  budgetPeriod: string | null;
  metrics: ReportMetrics;
};
export type ReportAccount = {
  accountId: string;
  customerId: string;
  name: string;
  currency: string;
  timeZone: string;
  testAccount: boolean | null;
  status: "ok" | "error";
  fetchedAt: string | null;
  error: { code: string; message: string } | null;
  campaigns: ReportCampaign[];
  daily: ReportDaily[];
  totals: ReportMetrics | null;
};
export type CurrencySummary = {
  currency: string;
  accountIds: string[];
  totals: ReportMetrics;
  daily: ReportDaily[];
};
export type GoogleAdsReport = {
  workspaceId: string;
  dateFrom: string;
  dateTo: string;
  fetchedAt: string;
  status: "ok" | "partial" | "error" | "no_accounts";
  accounts: ReportAccount[];
  summaries: CurrencySummary[];
};
export type DateRange = { dateFrom: string; dateTo: string };
export type CampaignRow = ReportCampaign & { account: ReportAccount };
export type CampaignSort =
  | "name"
  | "status"
  | "impressions"
  | "clicks"
  | "costMicros"
  | "conversions"
  | "ctr"
  | "averageCpc"
  | "roas";

const DAY = 86_400_000;

export function validReportDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function reportDateError({
  dateFrom,
  dateTo,
}: DateRange): string | null {
  if (!validReportDate(dateFrom) || !validReportDate(dateTo))
    return "시작일과 종료일을 입력해 주세요.";
  const days = (Date.parse(dateTo) - Date.parse(dateFrom)) / DAY + 1;
  if (days < 1) return "종료일은 시작일 이후여야 합니다.";
  if (days > 92) return "조회 기간은 시작일과 종료일을 포함해 최대 92일입니다.";
  return null;
}

export function presetReportDates(
  days: 7 | 30,
  timeZone: string,
  now = new Date()
): DateRange {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  const dateTo = `${part("year")}-${part("month")}-${part("day")}`;
  const dateFrom = new Date(
    Date.parse(`${dateTo}T00:00:00Z`) - (days - 1) * DAY
  )
    .toISOString()
    .slice(0, 10);
  return { dateFrom, dateTo };
}

// This is also the BFF query allowlist. Unknown keys never reach the backend.
export function reportQuery(query: URLSearchParams): string | null {
  const keys = ["dateFrom", "dateTo", "accountId"];
  if (keys.some((key) => query.getAll(key).length > 1)) return null;
  const range = {
    dateFrom: query.get("dateFrom") ?? "",
    dateTo: query.get("dateTo") ?? "",
  };
  if (reportDateError(range)) return null;
  const accountId = query.get("accountId");
  if (accountId !== null && !/^[1-9]\d*$/.test(accountId)) return null;
  const allowed = new URLSearchParams(range);
  if (accountId) allowed.set("accountId", accountId);
  return allowed.toString();
}

export function formatReportNumber(value: number | null, digits = 2) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits }).format(
        value
      );
}

export function formatReportMoney(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatReportMicros(value: string | null, currency: string) {
  if (value === null || !/^-?\d+$/.test(value)) return "—";
  const formatter = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = BigInt(10) ** BigInt(6 - digits);
  const micros = BigInt(value);
  const absolute = micros < BigInt(0) ? -micros : micros;
  const rounded = (absolute + scale / BigInt(2)) / scale;
  const unit = BigInt(10) ** BigInt(digits);
  const whole = rounded / unit;
  const fraction = (rounded % unit).toString().padStart(digits, "0");
  const parts = formatter.formatToParts(micros < BigInt(0) ? -whole : whole);
  const formatted = parts
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
  return micros < BigInt(0) && whole === BigInt(0)
    ? `-${formatted}`
    : formatted;
}

export function formatReportPercent(value: number | null) {
  return value === null ? "—" : `${formatReportNumber(value * 100)}%`;
}

export function reportPrimaryStatus(value: string) {
  return (
    (
      {
        ELIGIBLE: "게재 가능",
        LIMITED: "게재 제한",
        NOT_ELIGIBLE: "게재 불가",
        PAUSED: "일시중지",
        REMOVED: "삭제됨",
        ENDED: "종료됨",
        PENDING: "시작 대기",
        MISCONFIGURED: "설정 확인 필요",
        LEARNING: "학습 중",
        UNDER_REVIEW: "심사 중",
        UNKNOWN: "알 수 없음",
        UNSPECIFIED: "미지정",
      } as Record<string, string>
    )[value] ?? value
  );
}

export function formatReportTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "확인 불가";
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(value)) + " KST"
  );
}

export function reportErrorMessage(code?: string, httpStatus?: number) {
  const messages: Record<string, string> = {
    GOOGLE_ADS_REAUTH_REQUIRED:
      "Google 인증이 만료되었습니다. 소유자 또는 관리자에게 다시 인증을 요청해 주세요.",
    GOOGLE_ADS_PERMISSION_DENIED: "광고계정 접근 권한을 확인해 주세요.",
    GOOGLE_ADS_CUSTOMER_NOT_ENABLED:
      "사용할 수 없는 광고계정입니다. Google Ads에서 계정 상태를 확인해 주세요.",
    GOOGLE_ADS_RATE_LIMITED:
      "Google Ads 요청 한도에 도달했습니다. 잠시 후 새로고침해 주세요.",
    GOOGLE_ADS_UPSTREAM_UNAVAILABLE:
      "Google Ads에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.",
    GOOGLE_ADS_REPORT_FAILED:
      "성과를 불러오지 못했습니다. 다시 시도하거나 광고계정 연결을 확인해 주세요.",
  };
  if (code && messages[code]) return messages[code];
  if (httpStatus === 401)
    return "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
  if (httpStatus === 403) return "이 워크스페이스의 조회 권한을 확인해 주세요.";
  return "성과를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.";
}

export function reportSummaries(
  report: GoogleAdsReport,
  accountId: string
): CurrencySummary[] {
  if (accountId === "all") return report.summaries;
  const account = report.accounts.find((item) => item.accountId === accountId);
  return account?.status === "ok" && account.totals
    ? [
        {
          currency: account.currency,
          accountIds: [account.accountId],
          totals: account.totals,
          daily: account.daily,
        },
      ]
    : [];
}

export function isGoogleAdsReport(value: unknown): value is GoogleAdsReport {
  const object = (item: unknown): item is Record<string, unknown> =>
    item !== null && typeof item === "object";
  const numeric = (item: unknown) =>
    typeof item === "number" && Number.isFinite(item);
  const metrics = (item: unknown) =>
    object(item) &&
    ["impressions", "clicks", "conversions", "conversionValue"].every((key) =>
      numeric(item[key])
    ) &&
    typeof item.costMicros === "string" &&
    /^-?\d+$/.test(item.costMicros) &&
    ["ctr", "averageCpc", "costPerConversion", "roas"].every(
      (key) => item[key] === null || numeric(item[key])
    );
  const daily = (items: unknown) =>
    Array.isArray(items) &&
    items.every(
      (item) =>
        object(item) &&
        typeof item.date === "string" &&
        validReportDate(item.date) &&
        metrics(item)
    );
  const campaign = (item: unknown) =>
    object(item) &&
    ["id", "name", "status", "primaryStatus", "channel"].every(
      (key) => typeof item[key] === "string"
    ) &&
    (item.budgetMicros === null ||
      (typeof item.budgetMicros === "string" &&
        /^-?\d+$/.test(item.budgetMicros))) &&
    (item.budgetPeriod === null || typeof item.budgetPeriod === "string") &&
    metrics(item.metrics);
  return (
    object(value) &&
    typeof value.workspaceId === "string" &&
    typeof value.dateFrom === "string" &&
    validReportDate(value.dateFrom) &&
    typeof value.dateTo === "string" &&
    validReportDate(value.dateTo) &&
    typeof value.fetchedAt === "string" &&
    Number.isFinite(Date.parse(value.fetchedAt)) &&
    ["ok", "partial", "error", "no_accounts"].includes(String(value.status)) &&
    Array.isArray(value.accounts) &&
    value.accounts.every(
      (account) =>
        object(account) &&
        ["accountId", "customerId", "name", "timeZone"].every(
          (key) => typeof account[key] === "string"
        ) &&
        typeof account.currency === "string" &&
        /^[A-Z]{3}$/.test(account.currency) &&
        ["ok", "error"].includes(String(account.status)) &&
        (account.testAccount === null ||
          typeof account.testAccount === "boolean") &&
        (account.fetchedAt === null ||
          (typeof account.fetchedAt === "string" &&
            Number.isFinite(Date.parse(account.fetchedAt)))) &&
        (account.error === null ||
          (object(account.error) &&
            typeof account.error.code === "string" &&
            typeof account.error.message === "string")) &&
        Array.isArray(account.campaigns) &&
        account.campaigns.every(campaign) &&
        daily(account.daily) &&
        (account.totals === null || metrics(account.totals))
    ) &&
    Array.isArray(value.summaries) &&
    value.summaries.every(
      (summary) =>
        object(summary) &&
        typeof summary.currency === "string" &&
        /^[A-Z]{3}$/.test(summary.currency) &&
        Array.isArray(summary.accountIds) &&
        summary.accountIds.every((id) => typeof id === "string") &&
        metrics(summary.totals) &&
        daily(summary.daily)
    )
  );
}

export function campaignRows(
  report: GoogleAdsReport,
  accountId: string
): CampaignRow[] {
  return report.accounts
    .filter(
      (account) =>
        account.status === "ok" &&
        (accountId === "all" || account.accountId === accountId)
    )
    .flatMap((account) =>
      account.campaigns.map((campaign) => ({ ...campaign, account }))
    );
}

export function filterCampaignRows(
  rows: CampaignRow[],
  search: string,
  status: string,
  sort: CampaignSort,
  direction: "asc" | "desc"
) {
  const query = search.trim().toLocaleLowerCase("ko");
  return rows
    .filter(
      (row) =>
        (status === "all" || row.status === status) &&
        `${row.name} ${row.id} ${row.account.name} ${row.account.customerId}`
          .toLocaleLowerCase("ko")
          .includes(query)
    )
    .sort((a, b) => {
      // Monetary values in different currencies are not comparable.
      if (
        ["costMicros", "averageCpc"].includes(sort) &&
        a.account.currency !== b.account.currency
      )
        return a.account.currency.localeCompare(b.account.currency);
      const left =
        sort === "name" || sort === "status" ? a[sort] : a.metrics[sort];
      const right =
        sort === "name" || sort === "status" ? b[sort] : b.metrics[sort];
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      let comparison: number;
      if (sort === "costMicros")
        comparison =
          BigInt(left) < BigInt(right)
            ? -1
            : BigInt(left) > BigInt(right)
            ? 1
            : 0;
      else if (typeof left === "string" && typeof right === "string")
        comparison = left.localeCompare(right, "ko");
      else comparison = Number(left) - Number(right);
      return (
        comparison * (direction === "asc" ? 1 : -1) || a.id.localeCompare(b.id)
      );
    });
}
