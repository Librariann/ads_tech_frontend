import {
  campaignRows,
  reportSummaries,
  validReportDate,
  type CurrencySummary,
  type GoogleAdsReport,
} from "./google-ads-report";

export type OverviewDay = { date: string; clicks: number | null };

export function overviewWeekday(date: string): string {
  if (!validReportDate(date)) return "";
  return ["일", "월", "화", "수", "목", "금", "토"][
    new Date(`${date}T00:00:00Z`).getUTCDay()
  ];
}

export function overviewDays(
  report: GoogleAdsReport,
  summary?: CurrencySummary
): OverviewDay[] {
  if (!validReportDate(report.dateTo)) return [];
  const end = Date.parse(`${report.dateTo}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end - (6 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const day = summary?.daily.find((item) => item.date === date);
    return {
      date,
      clicks: date >= report.dateFrom && day ? day.clicks : null,
    };
  });
}

export function deriveDashboardOverview(
  report: GoogleAdsReport,
  preferredCurrency: string
) {
  const successful = report.accounts.filter(
    (account) => account.status === "ok"
  );
  const failed = report.accounts.filter(
    (account) => account.status === "error"
  );
  const availableIds = new Set(
    successful
      .filter((account) => account.totals !== null)
      .map((account) => account.accountId)
  );
  // Never reuse a summary containing a failed or unavailable account's metrics.
  const summaries = reportSummaries(report, "all").filter(
    (item) =>
      item.accountIds.length > 0 &&
      item.accountIds.every((id) => availableIds.has(id))
  );
  const summary =
    summaries.find((item) => item.currency === preferredCurrency) ??
    summaries[0];
  const rows = campaignRows(report, "all").filter(
    (row) => summary && row.account.currency === summary.currency
  );
  const allPaused =
    rows.length > 0 && rows.every((row) => row.status === "PAUSED");
  const allTest =
    successful.length > 0 &&
    successful.every((account) => account.testAccount === true);
  const testCount = successful.filter(
    (account) => account.testAccount === true
  ).length;
  const unknownTestCount = successful.filter(
    (account) => account.testAccount === null
  ).length;
  const noActivity = Boolean(
    summary &&
      summary.totals.impressions === 0 &&
      summary.totals.clicks === 0 &&
      summary.totals.conversions === 0 &&
      Number(summary.totals.costMicros) === 0
  );
  const status = allPaused
    ? {
        title: "광고가 일시중지되어 있어요",
        description:
          "선택 통화의 캠페인이 모두 일시중지 상태예요. 상세 화면에서 캠페인과 게재 상태를 확인해 주세요.",
        action: "캠페인 확인",
        target: "campaigns" as const,
      }
    : !rows.length
    ? {
        title: summary ? "조회된 캠페인이 없어요" : "성과를 확인할 수 없어요",
        description: summary
          ? "선택 통화의 계정에서 조회된 캠페인이 없어요. 계정 연결과 캠페인 설정을 확인해 주세요."
          : "조회 가능한 성과가 없어요. 광고계정 연결 상태를 확인해 주세요.",
        action: "광고계정 확인",
        target: "setup" as const,
      }
    : noActivity
    ? {
        title: "최근 30일 광고 활동이 없어요",
        description:
          "조회된 노출, 클릭, 광고비와 전환이 모두 0이에요. 캠페인의 실제 게재 상태와 계정 연결을 확인해 주세요.",
        action: "캠페인 확인",
        target: "campaigns" as const,
      }
    : {
        title: "캠페인 상태를 확인해 주세요",
        description:
          "사용 설정과 실제 게재 상태는 달라요. 캠페인별 게재 가능 여부와 제한 사항을 확인해 주세요.",
        action: "캠페인 확인",
        target: "campaigns" as const,
      };

  return {
    summaries,
    summary,
    successful,
    failed,
    rows,
    campaigns: rows.slice(0, 6),
    days: overviewDays(report, summary),
    allPaused,
    allTest,
    testCount,
    unknownTestCount,
    noActivity,
    status,
  };
}
