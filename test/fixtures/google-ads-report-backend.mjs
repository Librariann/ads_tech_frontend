// Isolated browser-test backend only. No external APIs or production data.
// Run: node test/fixtures/google-ads-report-backend.mjs
// Point an isolated Next instance at AUTH_API_URL=http://127.0.0.1:8102.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const DAY = 86_400_000;
export const reportScenarios = [
  "populated",
  "empty",
  "error",
  "partial",
  "multi_currency",
  "no_accounts",
  "no_workspaces",
  "http_error",
];
export const fixtureWorkspaces = ["900", "901"].map((id) => ({
  id,
  name: `성과 검증 워크스페이스 ${id}`,
  slug: `report-fixture-${id}`,
  role: id === "900" ? "owner" : "viewer",
  status: "active",
  defaultCurrency: "KRW",
  timezone: "Asia/Seoul",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}));

function metrics(
  impressions = 0,
  clicks = 0,
  costMicros = "0",
  conversions = 0,
  conversionValue = 0
) {
  const cost = Number(costMicros) / 1_000_000;
  return {
    impressions,
    clicks,
    costMicros,
    conversions,
    conversionValue,
    ctr: impressions ? clicks / impressions : null,
    averageCpc: clicks ? cost / clicks : null,
    costPerConversion: conversions ? cost / conversions : null,
    roas: cost ? conversionValue / cost : null,
  };
}

function sum(items) {
  return metrics(
    items.reduce((total, item) => total + item.impressions, 0),
    items.reduce((total, item) => total + item.clicks, 0),
    items
      .reduce((total, item) => total + BigInt(item.costMicros), 0n)
      .toString(),
    items.reduce((total, item) => total + item.conversions, 0),
    items.reduce((total, item) => total + item.conversionValue, 0)
  );
}

export function buildFixtureReport({
  scenario = "populated",
  workspaceId = "900",
  dateFrom = "2026-10-04",
  dateTo = "2026-11-02",
  accountId,
  fetchedAt = "2026-11-02T03:24:00Z",
} = {}) {
  const dates = [];
  for (
    let time = Date.parse(`${dateFrom}T00:00:00Z`);
    time <= Date.parse(`${dateTo}T00:00:00Z`) && dates.length < 92;
    time += DAY
  )
    dates.push(new Date(time).toISOString().slice(0, 10));
  const empty = scenario === "empty";
  let accounts = [0, 1].map((accountIndex) => {
    const currency =
      scenario === "multi_currency" && accountIndex === 1 ? "USD" : "KRW";
    const failed =
      scenario === "error" || (scenario === "partial" && accountIndex === 1);
    const campaigns =
      empty || failed
        ? []
        : Array.from({ length: accountIndex === 0 ? 25 : 3 }, (_, index) => {
            const status = ["ENABLED", "PAUSED", "REMOVED"][index % 3];
            return {
              id: String(1000 + accountIndex * 100 + index),
              name: `${workspaceId} 검증 캠페인 ${String(index + 1).padStart(
                2,
                "0"
              )}${
                index === 1
                  ? " 긴 이름 모바일 줄바꿈 확인을 위한 검색 캠페인"
                  : ""
              }`,
              status,
              primaryStatus:
                status === "ENABLED"
                  ? index % 2
                    ? "LIMITED"
                    : "ELIGIBLE"
                  : status,
              channel: index % 2 ? "PERFORMANCE_MAX" : "SEARCH",
              budgetMicros:
                index === 2
                  ? null
                  : currency === "KRW"
                  ? "30000000000"
                  : "30000000",
              budgetPeriod: index === 2 ? null : "DAILY",
              metrics:
                index === 2
                  ? metrics()
                  : metrics(
                      1000 * (index + 1),
                      30 * (index + 1),
                      String(
                        (currency === "KRW" ? 7500000000n : 7500000n) *
                          BigInt(index + 1)
                      ),
                      (index + 1) * 1.25,
                      (currency === "KRW" ? 15000 : 15) * (index + 1)
                    ),
            };
          });
    const totals = failed
      ? null
      : sum(campaigns.map((campaign) => campaign.metrics));
    const daily = failed
      ? []
      : dates.map((date, index) => ({
          date,
          ...(index === dates.length - 1 ? totals : metrics()),
        }));
    // Spread campaign metrics over requested dates for a non-flat, reconciled chart.
    if (!empty && !failed && dates.length) {
      daily.forEach((day, index) =>
        Object.assign(
          day,
          sum(
            campaigns
              .filter(
                (_, campaignIndex) => campaignIndex % dates.length === index
              )
              .map((campaign) => campaign.metrics)
          )
        )
      );
    }
    return {
      accountId: String(50 + accountIndex),
      customerId: String(1234567890 + accountIndex),
      name: `${currency} 성과 검증 계정 ${accountIndex + 1}`,
      currency,
      timeZone: accountIndex ? "America/Los_Angeles" : "Asia/Seoul",
      testAccount: true,
      status: failed ? "error" : "ok",
      fetchedAt: failed ? null : fetchedAt,
      error: failed
        ? {
            code: accountIndex
              ? "GOOGLE_ADS_PERMISSION_DENIED"
              : "GOOGLE_ADS_REAUTH_REQUIRED",
            message: "Sanitized fixture error",
          }
        : null,
      campaigns,
      daily,
      totals,
    };
  });
  if (scenario === "no_accounts") accounts = [];
  if (accountId)
    accounts = accounts.filter((account) => account.accountId === accountId);
  const successful = accounts.filter((account) => account.status === "ok");
  const summaries = [
    ...new Set(successful.map((account) => account.currency)),
  ].map((currency) => {
    const group = successful.filter((account) => account.currency === currency);
    return {
      currency,
      accountIds: group.map((account) => account.accountId),
      totals: sum(group.map((account) => account.totals)),
      daily: dates.map((date) => ({
        date,
        ...sum(
          group.flatMap((account) =>
            account.daily.filter((day) => day.date === date)
          )
        ),
      })),
    };
  });
  const status = !accounts.length
    ? "no_accounts"
    : !successful.length
    ? "error"
    : successful.length < accounts.length
    ? "partial"
    : "ok";
  return {
    workspaceId,
    dateFrom,
    dateTo,
    fetchedAt,
    status,
    accounts,
    summaries,
  };
}

export function createReportFixtureServer() {
  let scenario = "populated";
  let delayMs = 0;
  let accountDelays = {};
  const reports = [];
  const tokens = () => ({
    accessToken: `eyJhbGciOiJub25lIn0.${Buffer.from(
      JSON.stringify({ sub: "900", exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url")}.fixture-only`,
    refreshToken: "report-fixture-refresh",
    tokenType: "Bearer",
  });
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    let body = {};
    let status = 200;
    let payload;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
      status = 400;
    }
    if (url.pathname === "/auth/oauth/google") {
      response.writeHead(302, {
        Location:
          "http://127.0.0.1:3102/api/auth/oauth/callback?code=fixture-only",
        "Cache-Control": "private, no-store",
      });
      response.end();
      return;
    }
    if (url.pathname === "/__test/state" && request.method === "POST") {
      if (body.scenario && !reportScenarios.includes(body.scenario)) {
        status = 400;
        payload = { message: "Unknown scenario", scenarios: reportScenarios };
      } else {
        scenario = body.scenario ?? scenario;
        delayMs = Math.min(10000, Math.max(0, Number(body.delayMs ?? 0)));
        accountDelays = body.accountDelays ?? {};
        reports.length = 0;
        payload = { scenario, delayMs, accountDelays };
      }
    } else if (url.pathname === "/__test/state")
      payload = { scenario, delayMs, reports };
    else if (
      ["/auth/login", "/auth/refresh", "/auth/oauth/exchange"].includes(
        url.pathname
      )
    )
      payload = tokens();
    else if (url.pathname === "/auth/logout") payload = { ok: true };
    else if (url.pathname === "/auth/me")
      payload = {
        id: "900",
        email: "report-qa@example.test",
        displayName: "성과 검증 사용자",
        isPlatformAdmin: false,
      };
    else if (url.pathname === "/workspaces/invitations") payload = [];
    else if (url.pathname === "/workspaces")
      payload = scenario === "no_workspaces" ? [] : fixtureWorkspaces;
    else if (/^\/workspaces\/90[01]$/.test(url.pathname))
      payload = fixtureWorkspaces.find(
        (workspace) => workspace.id === url.pathname.split("/")[2]
      );
    else if (
      /^\/workspaces\/90[01]\/integrations\/google-ads\/report$/.test(
        url.pathname
      )
    ) {
      reports.push({
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      });
      payload = buildFixtureReport({
        scenario,
        workspaceId: url.pathname.split("/")[2],
        ...Object.fromEntries(url.searchParams),
        fetchedAt: new Date().toISOString(),
      });
      if (scenario === "http_error") {
        status = 503;
        payload = {
          code: "GOOGLE_ADS_UPSTREAM_UNAVAILABLE",
          message: "Sanitized fixture error",
        };
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Number(
            accountDelays[url.searchParams.get("accountId") ?? "all"] ?? delayMs
          )
        )
      );
    } else {
      status = 404;
      payload = { message: "Fixture route not found" };
    }
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    });
    response.end(JSON.stringify(payload));
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.FIXTURE_PORT ?? 8102);
  createReportFixtureServer().listen(port, "127.0.0.1", () =>
    console.log(`Report fixture: http://127.0.0.1:${port} (test data only)`)
  );
}
