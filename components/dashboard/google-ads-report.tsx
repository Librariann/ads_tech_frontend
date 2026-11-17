"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";

import {
  campaignRows,
  filterCampaignRows,
  formatReportMicros,
  formatReportMoney,
  formatReportNumber,
  formatReportPercent,
  formatReportTime,
  isGoogleAdsReport,
  presetReportDates,
  reportDateError,
  reportErrorMessage,
  reportPrimaryStatus,
  reportSummaries,
  type CampaignRow,
  type CampaignSort,
  type DateRange,
  type GoogleAdsReport,
  type ReportAccount,
  type ReportDaily,
} from "@/lib/integrations/google-ads-report";
import type { Workspace } from "@/lib/workspaces/types";
import type { BillingPlan } from "@/lib/workspaces/types";
import type { AuthUser } from "@/lib/auth/server";
import styles from "./google-ads-report.module.css";
import { DashboardOverview } from "./dashboard-overview";

type LoadResult = {
  key: string;
  report?: GoogleAdsReport;
  error?: string;
  loginRequired?: boolean;
};
type ChartMetric = "costMicros" | "impressions" | "clicks" | "conversions";
const metricLabels: Record<ChartMetric, string> = {
  costMicros: "광고비",
  impressions: "노출",
  clicks: "클릭",
  conversions: "전환",
};
const statusLabels: Record<string, string> = {
  ENABLED: "사용 설정",
  PAUSED: "일시중지",
  REMOVED: "삭제됨",
  UNKNOWN: "알 수 없음",
  UNSPECIFIED: "미지정",
};
const PAGE_SIZE = 20;

export function GoogleAdsReportDashboard({
  workspaces,
  workspace,
  initialDates,
  view = "detail",
  homeUser,
  invitationsCount,
  plan,
}: {
  workspaces: Workspace[];
  workspace: Workspace;
  initialDates: DateRange;
  view?: "overview" | "detail";
  homeUser?: AuthUser;
  invitationsCount?: number;
  plan?: BillingPlan | null;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState("all");
  const [accounts, setAccounts] = useState<ReportAccount[]>([]);
  const [preset, setPreset] = useState("30");
  const [range, setRange] = useState(initialDates);
  const [draft, setDraft] = useState(initialDates);
  const [dateError, setDateError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [currency, setCurrency] = useState(workspace.defaultCurrency);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("costMicros");
  const generation = useRef(0);
  const requestKey = `${workspace.id}:${accountId}:${range.dateFrom}:${range.dateTo}:${refresh}`;
  const loading = result?.key !== requestKey;
  const current = loading ? undefined : result;
  const report = current?.report;
  const setupHref = `/workspaces/${workspace.id}/advertising`;

  useEffect(() => {
    const controller = new AbortController();
    const requestGeneration = ++generation.current;
    const query = new URLSearchParams({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    });
    if (accountId !== "all") query.set("accountId", accountId);
    const isCurrent = () =>
      !controller.signal.aborted && generation.current === requestGeneration;

    async function load() {
      try {
        const response = await fetch(
          `/api/workspaces/${workspace.id}/integrations/google-ads/report?${query}`,
          {
            signal: controller.signal,
            cache: "no-store",
            credentials: "same-origin",
          }
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!isCurrent()) return;
        if (!response.ok) {
          const code =
            payload &&
            typeof payload === "object" &&
            "code" in payload &&
            typeof payload.code === "string"
              ? payload.code
              : undefined;
          setResult({
            key: requestKey,
            error: reportErrorMessage(code, response.status),
            loginRequired:
              response.status === 401 && code !== "GOOGLE_ADS_REAUTH_REQUIRED",
          });
          return;
        }
        if (
          !isGoogleAdsReport(payload) ||
          payload.workspaceId !== workspace.id ||
          payload.dateFrom !== range.dateFrom ||
          payload.dateTo !== range.dateTo
        ) {
          throw new Error("Invalid report response");
        }
        setResult({ key: requestKey, report: payload });
        // Filtered reports contain only the selected account, not the option inventory.
        setAccounts((previous) =>
          accountId === "all"
            ? payload.accounts
            : [
                ...previous.filter(
                  (account) =>
                    !payload.accounts.some(
                      (item) => item.accountId === account.accountId
                    )
                ),
                ...payload.accounts,
              ].sort((a, b) => a.name.localeCompare(b.name, "ko"))
        );
      } catch {
        if (isCurrent())
          setResult({ key: requestKey, error: reportErrorMessage() });
      }
    }
    void load();
    return () => controller.abort();
  }, [workspace.id, accountId, range.dateFrom, range.dateTo, requestKey]);

  const summaries = report ? reportSummaries(report, accountId) : [];
  const summary =
    summaries.find((item) => item.currency === currency) ?? summaries[0];
  const scopedAccounts =
    report?.accounts.filter(
      (account) => accountId === "all" || account.accountId === accountId
    ) ?? [];
  const successful = scopedAccounts.filter(
    (account) => account.status === "ok"
  );
  const failed = scopedAccounts.filter((account) => account.status === "error");
  const rows = report ? campaignRows(report, accountId) : [];

  function changePreset(value: string) {
    setPreset(value);
    setDateError(null);
    if (value !== "custom") {
      const dates = presetReportDates(
        value === "7" ? 7 : 30,
        workspace.timezone
      );
      setRange(dates);
      setDraft(dates);
    }
  }

  if (view === "overview") {
    return (
      <DashboardOverview
        workspace={workspace}
        report={report}
        loading={loading}
        error={current?.error}
        loginRequired={current?.loginRequired}
        onRefresh={() => setRefresh((value) => value + 1)}
        homeUser={homeUser}
        invitationsCount={invitationsCount}
        plan={plan}
      />
    );
  }

  return (
    <div className={styles.report}>
      <Link className={styles.action} href={`/workspaces/${workspace.id}/campaigns`}>광고 관리</Link>
      <div className={styles.filters}>
        <label className={styles.field}>
          <span>워크스페이스</span>
          <select
            value={workspace.id}
            onChange={(event) =>
              router.push(
                `/dashboard/google-ads?workspaceId=${encodeURIComponent(
                  event.target.value
                )}`
              )
            }
          >
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>광고계정</span>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            disabled={!accounts.length}
          >
            <option value="all">전체 계정</option>
            {accounts.map((account) => (
              <option key={account.accountId} value={account.accountId}>
                {account.name || account.customerId} · {account.currency}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>조회 기간</span>
          <select
            value={preset}
            onChange={(event) => changePreset(event.target.value)}
          >
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="custom">직접 선택</option>
          </select>
        </label>
        <button
          type="button"
          className={styles.iconButton}
          title="성과 새로고침"
          aria-label="성과 새로고침"
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </div>

      {preset === "custom" && (
        <form
          className={styles.customDates}
          onSubmit={(event) => {
            event.preventDefault();
            const error = reportDateError(draft);
            setDateError(error);
            if (!error) setRange(draft);
          }}
        >
          <label className={styles.field}>
            <span>시작일</span>
            <input
              type="date"
              required
              value={draft.dateFrom}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? "report-date-error" : undefined}
              onChange={(event) =>
                setDraft({ ...draft, dateFrom: event.target.value })
              }
            />
          </label>
          <label className={styles.field}>
            <span>종료일</span>
            <input
              type="date"
              required
              value={draft.dateTo}
              aria-invalid={Boolean(dateError)}
              aria-describedby={dateError ? "report-date-error" : undefined}
              onChange={(event) =>
                setDraft({ ...draft, dateTo: event.target.value })
              }
            />
          </label>
          <button className={styles.action} type="submit">
            기간 적용
          </button>
          {dateError && (
            <p id="report-date-error" role="alert" className={styles.errorText}>
              {dateError}
            </p>
          )}
        </form>
      )}

      <div className={styles.meta}>
        <p>
          조회: {range.dateFrom} – {range.dateTo} · 양 끝 날짜 포함 · 오늘 포함
          시 집계 중
        </p>
        <p>
          {report
            ? `가져온 시각: ${formatReportTime(report.fetchedAt)} · `
            : ""}
          요청 시 조회 · 자동 갱신 없음
        </p>
      </div>

      <div aria-busy={loading}>
        {loading ? (
          <div role="status" className={styles.loading}>
            <LoaderCircle
              className="size-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            성과를 불러오는 중입니다.
          </div>
        ) : current?.error ? (
          <section className={styles.empty} role="alert">
            <h2>성과를 불러올 수 없습니다</h2>
            <p>{current.error}</p>
            {current.loginRequired ? (
              <Link className={styles.action} href="/login">
                다시 로그인
              </Link>
            ) : (
              <button
                type="button"
                className={styles.action}
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RefreshCw aria-hidden="true" />
                다시 시도
              </button>
            )}
            <Link className={styles.textLink} href={setupHref}>
              광고계정 연결 확인
            </Link>
          </section>
        ) : report?.status === "no_accounts" ? (
          <section className={styles.empty}>
            <h2>등록된 Google Ads 계정이 없습니다</h2>
            <p>
              성과를 조회할 광고계정을 등록해 주세요. 계정 등록 권한이 없다면
              워크스페이스 소유자 또는 관리자에게 요청해 주세요.
            </p>
            <Link className={styles.action} href={setupHref}>
              광고계정 등록
              <ExternalLink aria-hidden="true" />
            </Link>
          </section>
        ) : report ? (
          <>
            {(report.status === "partial" ||
              report.status === "error" ||
              failed.length > 0) && (
              <div className={styles.notice} role="status">
                <AlertTriangle aria-hidden="true" />
                <div>
                  <strong>
                    {report.status === "error"
                      ? "계정 성과를 가져오지 못했습니다."
                      : "일부 계정의 성과가 누락되었습니다."}
                  </strong>
                  <p>
                    조회 실패 계정은 합계와 캠페인 목록에서 제외되며, 0으로
                    처리하지 않습니다. <Link href={setupHref}>연결 확인</Link>
                  </p>
                </div>
              </div>
            )}
            {scopedAccounts.some((account) => account.testAccount === true) && (
              <div className={styles.notice} role="status">
                <AlertTriangle aria-hidden="true" />
                <p>
                  조회된 계정 데이터만으로 실제 광고 집행·과금을 확인할 수 없습니다.
                </p>
              </div>
            )}

            {report.status !== "error" && summary ? (
              <>
                <section id="performance" className="scroll-mt-24">
                  <div className={styles.summaryHeader}>
                    <div>
                      <h2>기간 성과</h2>
                      <p>
                        {summary.currency} · 조회 성공{" "}
                        {summary.accountIds.length}개 계정 합계 · 다른 통화 제외
                      </p>
                    </div>
                    <label className={styles.field}>
                      <span>요약 통화</span>
                      <select
                        value={summary.currency}
                        onChange={(event) => setCurrency(event.target.value)}
                      >
                        {summaries.map((item) => (
                          <option key={item.currency} value={item.currency}>
                            {item.currency}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <dl className={styles.kpis}>
                    {[
                      [
                        "광고비",
                        formatReportMicros(
                          summary.totals.costMicros,
                          summary.currency
                        ),
                      ],
                      [
                        "노출",
                        formatReportNumber(summary.totals.impressions, 0),
                      ],
                      ["클릭", formatReportNumber(summary.totals.clicks, 0)],
                      ["전환", formatReportNumber(summary.totals.conversions)],
                      [
                        "전환 가치",
                        formatReportMoney(
                          summary.totals.conversionValue,
                          summary.currency
                        ),
                      ],
                      ["클릭률 (CTR)", formatReportPercent(summary.totals.ctr)],
                      [
                        "평균 클릭 비용 (CPC)",
                        formatReportMoney(
                          summary.totals.averageCpc,
                          summary.currency
                        ),
                      ],
                      [
                        "전환당 비용",
                        formatReportMoney(
                          summary.totals.costPerConversion,
                          summary.currency
                        ),
                      ],
                      [
                        "전환 가치 / 광고비 (ROAS)",
                        summary.totals.roas === null
                          ? "—"
                          : `${formatReportNumber(summary.totals.roas)}배`,
                      ],
                      [
                        "조회 성공 / 대상 계정",
                        `${successful.length} / ${scopedAccounts.length}`,
                      ],
                    ].map(([label, value]) => (
                      <div className={styles.kpi} key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-[#5c6863]">
                    광고비는 매체 집행 비용이며 GrowdoAds 이용료와 별도입니다.
                    —: 계산할 수 없거나 제공되지 않은 값
                  </p>
                </section>

                <section
                  className={styles.section}
                  aria-labelledby="daily-title"
                >
                  <div className={styles.sectionHeader}>
                    <h2 id="daily-title">일별 성과 · {summary.currency}</h2>
                    <label className={styles.field}>
                      <span>일별 지표</span>
                      <select
                        value={chartMetric}
                        onChange={(event) =>
                          setChartMetric(event.target.value as ChartMetric)
                        }
                      >
                        {Object.entries(metricLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <DailyChart
                    daily={summary.daily}
                    metric={chartMetric}
                    currency={summary.currency}
                  />
                </section>
              </>
            ) : (
              report.status !== "error" && (
                <section className={styles.empty}>
                  <h2>집계 가능한 성과가 없습니다</h2>
                  <p>
                    계정별 조회 상태를 확인하거나 다시 조회해 주세요. 누락된
                    성과는 0으로 표시하지 않습니다.
                  </p>
                </section>
              )
            )}

            <CampaignTable
              workspaceId={workspace.id}
              key={`${workspace.id}:${accountId}:${range.dateFrom}:${range.dateTo}`}
              rows={rows}
              allFailed={report.status === "error" || successful.length === 0}
            />
            <section
              className={styles.section}
              aria-labelledby="accounts-title"
            >
              <div className={styles.sectionHeader}>
                <h2 id="accounts-title">계정별 조회 상태</h2>
                <Link className={styles.textLink} href={setupHref}>
                  광고계정 관리
                </Link>
              </div>
              <p className="mt-2 text-xs leading-6 text-[#5c6863]">
                날짜는 각 광고계정의 현지 시간대 기준입니다. 서로 다른 시간대의
                일별 값은 같은 현지 날짜로 합산됩니다. 최근 성과는 Google 집계에
                따라 달라질 수 있습니다.
              </p>
              <div className={styles.accountList}>
                {scopedAccounts.map((account) => (
                  <div key={account.accountId} className={styles.accountRow}>
                    <div>
                      <strong>{account.name || account.customerId}</strong>
                      <p>
                        {account.customerId} · {account.currency} ·{" "}
                        {account.timeZone}
                      </p>
                      {account.status === "error" && (
                        <p className={styles.errorText}>
                          {reportErrorMessage(account.error?.code)}
                        </p>
                      )}
                      {account.status === "ok" && account.totals === null && (
                        <p className={styles.errorText}>
                          합계가 제공되지 않았습니다.
                        </p>
                      )}
                    </div>
                    <div>
                      <span
                        className={`${styles.status} ${
                          account.status === "ok" ? styles.enabled : ""
                        }`}
                      >
                        {account.status === "ok" ? "조회 성공" : "조회 실패"}
                      </span>
                      <p>가져온 시각: {formatReportTime(account.fetchedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function DailyChart({
  daily,
  metric,
  currency,
}: {
  daily: ReportDaily[];
  metric: ChartMetric;
  currency: string;
}) {
  const value = (day: ReportDaily) =>
    metric === "costMicros" ? Number(day.costMicros) / 1_000_000 : day[metric];
  const maximum = Math.max(0, ...daily.map(value));
  const scale = maximum || 1;
  const format = (day: ReportDaily) =>
    metric === "costMicros"
      ? formatReportMicros(day.costMicros, currency)
      : formatReportNumber(day[metric]);
  const axis = (number: number) =>
    new Intl.NumberFormat("ko-KR", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(number);
  if (!daily.length)
    return (
      <p className={styles.chartEmpty}>일별 성과가 제공되지 않았습니다.</p>
    );
  return (
    <>
      <div
        className={styles.chartScroll}
        tabIndex={0}
        role="region"
        aria-label={`일별 ${metricLabels[metric]} 차트${
          metric === "costMicros" ? ` (${currency})` : ""
        }`}
      >
        <div className={styles.chart}>
          <div className={styles.chartScale} aria-hidden="true">
            <span>{axis(scale)}</span>
            <span>{axis(scale / 2)}</span>
            <span>0</span>
          </div>
          <div className={styles.plot}>
            {daily.map((day) => (
              <div
                className={styles.bar}
                key={day.date}
                tabIndex={0}
                role="img"
                aria-label={`${day.date} ${metricLabels[metric]} ${format(
                  day
                )}`}
              >
                <span
                  className={styles.barFill}
                  style={{
                    height: `${(Math.max(0, value(day)) / scale) * 100}%`,
                  }}
                />
                <span aria-hidden="true" className={styles.barTooltip}>
                  {day.date}
                  <br />
                  {format(day)}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.chartDates} aria-hidden="true">
            <span>{daily[0].date}</span>
            {daily.length > 2 && (
              <span>{daily[Math.floor((daily.length - 1) / 2)].date}</span>
            )}
            <span>{daily.length > 1 ? daily[daily.length - 1].date : ""}</span>
          </div>
        </div>
      </div>
      {maximum === 0 && (
        <p className={styles.chartEmpty}>
          선택한 기간: {metricLabels[metric]} 0
        </p>
      )}
    </>
  );
}

function CampaignTable({
  workspaceId,
  rows,
  allFailed,
}: {
  workspaceId: string;
  rows: CampaignRow[];
  allFailed: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<CampaignSort>("costMicros");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const filtered = filterCampaignRows(rows, search, status, sort, direction);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const statuses = Array.from(new Set(rows.map((row) => row.status))).sort();

  function sortable(label: string, key: CampaignSort) {
    const Icon =
      sort === key ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th
        scope="col"
        aria-sort={
          sort === key
            ? direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
        className={
          key === "name" || key === "status" ? undefined : styles.numeric
        }
      >
        <button
          type="button"
          onClick={() => {
            setSort(key);
            setDirection(sort === key && direction === "desc" ? "asc" : "desc");
            setPage(1);
          }}
        >
          {label}
          <Icon aria-hidden="true" />
        </button>
      </th>
    );
  }

  return (
    <section
      id="campaigns"
      className={`${styles.section} scroll-mt-24`}
      aria-labelledby="campaigns-title"
    >
      <div className={styles.sectionHeader}>
        <h2 id="campaigns-title">
          캠페인{" "}
          <span className="text-sm font-normal text-[#5c6863]">
            {formatReportNumber(rows.length, 0)}개
          </span>
        </h2>
      </div>
      <div className={styles.tableTools}>
        <label className={`${styles.field} ${styles.search}`}>
          <span>캠페인·계정 검색</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="이름 또는 ID"
          />
        </label>
        <label className={styles.field}>
          <span>캠페인 상태</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">전체 상태</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value] ?? value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mb-3 text-xs text-[#5c6863]">
        현재 캠페인 설정 · 성과는 선택 기간 기준 · 비용 정렬은 통화별 · 예산은
        공유 예산일 수 있음
      </p>
      <div
        className={styles.tableScroll}
        tabIndex={0}
        role="region"
        aria-label="캠페인 성과 표"
      >
        <table className={styles.table}>
          <caption className="sr-only">
            현재 캠페인 설정과 조회 기간 성과. 금액은 각 계정 통화이며 조회 실패
            계정은 제외됩니다.
          </caption>
          <thead>
            <tr>
              {sortable("캠페인", "name")}
              <th scope="col">광고계정 / 통화</th>
              {sortable("설정 상태", "status")}
              <th scope="col">게재 상태 / 채널</th>
              <th scope="col" className={styles.numeric}>
                예산
              </th>
              {sortable("광고비", "costMicros")}
              {sortable("노출", "impressions")}
              {sortable("클릭", "clicks")}
              {sortable("전환", "conversions")}
              {sortable("CTR", "ctr")}
              {sortable("평균 CPC", "averageCpc")}
              <th scope="col" className={styles.numeric}>
                전환당 비용
              </th>
              <th scope="col" className={styles.numeric}>
                전환 가치
              </th>
              {sortable("ROAS", "roas")}
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((row) => (
                <tr key={`${row.account.accountId}:${row.id}`}>
                  <td className={styles.campaignName}>
                    <Link className={styles.textLink} href={`/workspaces/${encodeURIComponent(workspaceId)}/campaigns?${new URLSearchParams({ accountId: row.account.accountId, campaignId: row.id })}`}>{row.name}</Link>
                    <small>ID {row.id}</small>
                  </td>
                  <td>
                    {row.account.name || row.account.customerId}
                    <small>
                      {row.account.customerId} · {row.account.currency}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`${styles.status} ${
                        row.status === "ENABLED" ? styles.enabled : ""
                      }`}
                    >
                      {statusLabels[row.status] ?? row.status}
                    </span>
                  </td>
                  <td title={row.primaryStatus}>
                    {reportPrimaryStatus(row.primaryStatus)}
                    <small>{row.channel}</small>
                  </td>
                  <td className={styles.numeric}>
                    {formatReportMicros(row.budgetMicros, row.account.currency)}
                    <small>
                      {row.budgetPeriod === "DAILY"
                        ? "일일"
                        : row.budgetPeriod === "CUSTOM_PERIOD"
                        ? "전체 기간"
                        : row.budgetPeriod ?? "기간 미제공"}
                    </small>
                  </td>
                  <td className={styles.numeric}>
                    {formatReportMicros(
                      row.metrics.costMicros,
                      row.account.currency
                    )}
                  </td>
                  <td className={styles.numeric}>
                    {formatReportNumber(row.metrics.impressions, 0)}
                  </td>
                  <td className={styles.numeric}>
                    {formatReportNumber(row.metrics.clicks, 0)}
                  </td>
                  <td className={styles.numeric}>
                    {formatReportNumber(row.metrics.conversions)}
                  </td>
                  <td className={styles.numeric}>
                    {formatReportPercent(row.metrics.ctr)}
                  </td>
                  <td className={styles.numeric}>
                    {formatReportMoney(
                      row.metrics.averageCpc,
                      row.account.currency
                    )}
                  </td>
                  <td className={styles.numeric}>
                    {formatReportMoney(
                      row.metrics.costPerConversion,
                      row.account.currency
                    )}
                  </td>
                  <td className={styles.numeric}>
                    {formatReportMoney(
                      row.metrics.conversionValue,
                      row.account.currency
                    )}
                  </td>
                  <td className={styles.numeric}>
                    {row.metrics.roas === null
                      ? "—"
                      : `${formatReportNumber(row.metrics.roas)}배`}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={14} className="!py-10 text-center text-[#5c6863]">
                  {allFailed
                    ? "조회 실패로 캠페인을 표시할 수 없습니다."
                    : rows.length
                    ? "검색 조건에 맞는 캠페인이 없습니다."
                    : "등록된 캠페인이 없습니다. 선택 기간의 성과는 위에서 확인할 수 있습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <p>
          검색 결과 {formatReportNumber(filtered.length, 0)}개
          {filtered.length > 0
            ? ` · ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(
                currentPage * PAGE_SIZE,
                filtered.length
              )}`
            : ""}
        </p>
        {pages > 1 && (
          <div>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="이전 페이지"
              title="이전 페이지"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span>
              {currentPage} / {pages}
            </span>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="다음 페이지"
              title="다음 페이지"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
