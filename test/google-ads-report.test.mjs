import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import {
  buildFixtureReport,
  createReportFixtureServer,
} from "./fixtures/google-ads-report-backend.mjs";

const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const reportUrl = dataUrl(
  transpile(
    await readFile(
      new URL("../lib/integrations/google-ads-report.ts", import.meta.url),
      "utf8"
    )
  )
);
const {
  formatReportMicros,
  formatReportMoney,
  formatReportNumber,
  formatReportPercent,
  formatReportTime,
  presetReportDates,
  reportDateError,
  reportQuery,
  reportErrorMessage,
  reportPrimaryStatus,
  reportSummaries,
  campaignRows,
  filterCampaignRows,
  isGoogleAdsReport,
} = await import(reportUrl);

test("micros are converted once, with exact integer rounding beyond Number precision", () => {
  assert.match(formatReportMicros("123456789", "USD"), /123\.46/);
  assert.match(formatReportMicros("123456789", "KRW"), /123/);
  assert.match(
    formatReportMicros("9007199254740993123456", "USD"),
    /9,007,199,254,740,993\.12/
  );
  assert.match(
    formatReportMicros("9999999999999999995000", "USD"),
    /10,000,000,000,000,000\.00/
  );
  assert.match(formatReportMicros("-125000", "USD"), /-.*0\.13/);
  assert.equal(formatReportMicros(null, "KRW"), "—");
  assert.equal(formatReportMicros("not-a-number", "KRW"), "—");
});

test("zero is data, null ratios are unavailable, and CTR is a fraction", () => {
  assert.equal(formatReportNumber(0), "0");
  assert.equal(formatReportNumber(1.25), "1.25");
  assert.equal(formatReportPercent(0.03125), "3.13%");
  assert.equal(formatReportPercent(0), "0%");
  assert.equal(formatReportPercent(null), "—");
  assert.equal(formatReportMoney(null, "USD"), "—");
  assert.match(formatReportMoney(1.25, "USD"), /1\.25/);
  assert.match(formatReportMicros("0", "KRW"), /0/);
  assert.equal(formatReportNumber(Number.NaN), "—");
});

test("date validation uses real dates and the inclusive 92-day limit", () => {
  assert.equal(
    reportDateError({ dateFrom: "2026-01-01", dateTo: "2026-04-02" }),
    null
  );
  assert.match(
    reportDateError({ dateFrom: "2026-01-01", dateTo: "2026-04-03" }),
    /92일/
  );
  assert.equal(
    reportDateError({ dateFrom: "2024-02-29", dateTo: "2024-02-29" }),
    null
  );
  for (const dates of [
    { dateFrom: "2026-02-29", dateTo: "2026-03-01" },
    { dateFrom: "2026-04-31", dateTo: "2026-05-01" },
    { dateFrom: "", dateTo: "2026-05-01" },
    { dateFrom: "2026-05-02", dateTo: "2026-05-01" },
  ])
    assert.ok(reportDateError(dates));
});

test("presets include today in workspace timezone, including a DST boundary", () => {
  const now = new Date("2026-11-02T00:30:00Z");
  assert.deepEqual(presetReportDates(7, "Asia/Seoul", now), {
    dateFrom: "2026-10-27",
    dateTo: "2026-11-02",
  });
  assert.deepEqual(presetReportDates(30, "America/Los_Angeles", now), {
    dateFrom: "2026-10-03",
    dateTo: "2026-11-01",
  });
  assert.match(formatReportTime("2026-11-02T03:24:00Z"), /12:24:00 KST/);
  assert.equal(formatReportTime(null), "확인 불가");
});

test("query allowlist strips unknown keys and rejects duplicates or invalid internal account IDs", () => {
  const valid = "dateFrom=2026-11-01&dateTo=2026-11-02";
  assert.equal(
    reportQuery(
      new URLSearchParams(
        `${valid}&accountId=50&secret=x&customerId=1234567890`
      )
    ),
    `${valid}&accountId=50`
  );
  assert.equal(reportQuery(new URLSearchParams(valid)), valid);
  for (const suffix of [
    "&dateFrom=2026-11-01",
    "&dateTo=2026-11-02",
    "&accountId=50&accountId=51",
    "&accountId=0",
    "&accountId=all",
    "&accountId=",
    "&accountId=../50",
  ])
    assert.equal(reportQuery(new URLSearchParams(valid + suffix)), null);
  assert.equal(
    reportQuery(new URLSearchParams("dateFrom=2026-01-01&dateTo=2026-04-03")),
    null
  );
});

test("currency summaries never merge KRW and USD; single-account summaries use account totals", () => {
  const report = buildFixtureReport({ scenario: "multi_currency" });
  assert.equal(isGoogleAdsReport(report), true);
  const summaries = reportSummaries(report, "all");
  assert.deepEqual(
    summaries.map((item) => item.currency),
    ["KRW", "USD"]
  );
  assert.deepEqual(summaries[0].accountIds, ["50"]);
  assert.deepEqual(summaries[1].accountIds, ["51"]);
  assert.equal(reportSummaries(report, "51")[0].currency, "USD");
  assert.deepEqual(
    reportSummaries(report, "51")[0].totals,
    report.accounts[1].totals
  );
  assert.deepEqual(reportSummaries(report, "missing"), []);
});

test("partial and failed accounts are excluded, never counted as zero", () => {
  const partial = buildFixtureReport({ scenario: "partial" });
  assert.equal(partial.status, "partial");
  assert.equal(partial.accounts[1].totals, null);
  assert.equal(partial.accounts[1].fetchedAt, null);
  assert.deepEqual(reportSummaries(partial, "all")[0].accountIds, ["50"]);
  assert.deepEqual(reportSummaries(partial, "51"), []);
  assert.ok(
    campaignRows(partial, "all").every((row) => row.account.accountId === "50")
  );
  const failed = buildFixtureReport({ scenario: "error" });
  assert.equal(failed.status, "error");
  assert.deepEqual(reportSummaries(failed, "all"), []);
  assert.deepEqual(campaignRows(failed, "all"), []);
});

test("realistic empty test accounts have zero-filled requested days and no campaigns", () => {
  const empty = buildFixtureReport({
    scenario: "empty",
    dateFrom: "2026-10-04",
    dateTo: "2026-11-02",
  });
  assert.equal(empty.status, "ok");
  assert.equal(empty.accounts[0].testAccount, true);
  assert.equal(empty.accounts[0].daily.length, 30);
  assert.equal(empty.summaries[0].daily.length, 30);
  assert.equal(empty.accounts[0].totals.costMicros, "0");
  assert.equal(empty.accounts[0].totals.ctr, null);
  assert.equal(empty.accounts[0].totals.roas, null);
  assert.deepEqual(campaignRows(empty, "all"), []);
  assert.equal(
    buildFixtureReport({ scenario: "no_accounts" }).status,
    "no_accounts"
  );
});

test("fixture daily and campaign costs reconcile, and weighted ratios are not averaged", () => {
  const report = buildFixtureReport();
  const summary = report.summaries[0];
  assert.equal(
    summary.daily
      .reduce((total, day) => total + BigInt(day.costMicros), 0n)
      .toString(),
    summary.totals.costMicros
  );
  assert.equal(
    campaignRows(report, "all")
      .reduce((total, row) => total + BigInt(row.metrics.costMicros), 0n)
      .toString(),
    summary.totals.costMicros
  );
  assert.equal(
    summary.totals.ctr,
    summary.totals.clicks / summary.totals.impressions
  );
});

test("campaign search/status/sort are deterministic, include paused/removed, and keep null last", () => {
  const rows = campaignRows(
    buildFixtureReport({ scenario: "multi_currency" }),
    "all"
  );
  assert.equal(rows.length, 28);
  assert.ok(rows.some((row) => row.status === "PAUSED"));
  assert.ok(rows.some((row) => row.status === "REMOVED"));
  assert.ok(
    filterCampaignRows(rows, "긴 이름", "PAUSED", "name", "asc").length > 0
  );
  assert.equal(
    filterCampaignRows(rows, "not-found", "all", "name", "asc").length,
    0
  );
  assert.equal(
    filterCampaignRows(rows, "1234567891", "all", "name", "asc").length,
    3
  );
  for (const direction of ["asc", "desc"]) {
    const sorted = filterCampaignRows(rows, "", "all", "ctr", direction);
    assert.equal(sorted.at(-1).metrics.ctr, null);
    const monetary = filterCampaignRows(
      rows,
      "",
      "all",
      "costMicros",
      direction
    );
    assert.equal(monetary[0].account.currency, "KRW");
    assert.equal(monetary.at(-1).account.currency, "USD");
  }
  const huge = rows
    .slice(0, 2)
    .map((row, index) => ({
      ...row,
      metrics: {
        ...row.metrics,
        costMicros: index ? "9007199254740993" : "9007199254740992",
      },
    }));
  assert.equal(
    filterCampaignRows(huge, "", "all", "costMicros", "desc")[0].metrics
      .costMicros,
    "9007199254740993"
  );
});

test("setup and primary status do not promise actual delivery; errors are sanitized", () => {
  assert.equal(reportPrimaryStatus("ELIGIBLE"), "게재 가능");
  assert.equal(reportPrimaryStatus("LIMITED"), "게재 제한");
  assert.equal(reportPrimaryStatus("PAUSED"), "일시중지");
  assert.equal(reportPrimaryStatus("FUTURE_STATUS"), "FUTURE_STATUS");
  assert.match(
    reportErrorMessage("GOOGLE_ADS_REAUTH_REQUIRED", 401),
    /다시 인증/
  );
  assert.match(reportErrorMessage("GOOGLE_ADS_PERMISSION_DENIED"), /권한/);
  assert.match(
    reportErrorMessage("GOOGLE_ADS_CUSTOMER_NOT_ENABLED"),
    /계정 상태/
  );
  assert.match(reportErrorMessage("GOOGLE_ADS_RATE_LIMITED"), /한도/);
  assert.match(reportErrorMessage(undefined, 401), /로그인 세션/);
  assert.doesNotMatch(
    reportErrorMessage("access_token=secret upstream SQL error"),
    /secret|SQL|access_token/
  );
});

test("null or malformed report payloads are rejected rather than displayed as zero", () => {
  for (const value of [
    null,
    {},
    [],
    { ...buildFixtureReport(), accounts: null },
    { ...buildFixtureReport(), summaries: [{}] },
  ])
    assert.equal(isGoogleAdsReport(value), false);
  const invalid = buildFixtureReport();
  invalid.accounts[0].totals.costMicros = "1.5";
  assert.equal(isGoogleAdsReport(invalid), false);
});

const proxyUrl = dataUrl(
  "export const calls = []; export async function proxyAuthenticatedJson(path, init) { calls.push({path, init}); return Response.json({ok: true}); }"
);
const { calls } = await import(proxyUrl);
let routeSource = transpile(
  await readFile(
    new URL(
      "../app/api/workspaces/[workspaceId]/integrations/google-ads/[...path]/route.ts",
      import.meta.url
    ),
    "utf8"
  )
);
for (const [name, url] of Object.entries({
  "next/server": dataUrl("export const NextResponse = Response;"),
  "@/lib/auth/proxy": proxyUrl,
  "@/lib/integrations/google-ads-report": reportUrl,
})) {
  assert.ok(routeSource.includes(`from "${name}"`));
  routeSource = routeSource.replaceAll(`from "${name}"`, `from "${url}"`);
}
const { GET, POST } = await import(dataUrl(routeSource));
const context = (path = ["report"], workspaceId = "900") => ({
  params: Promise.resolve({ workspaceId, path }),
});

test("BFF report route forwards only validated GET queries through existing auth proxy without caching", async () => {
  calls.length = 0;
  const response = await GET(
    new Request(
      "http://localhost/api/report?dateFrom=2026-11-01&dateTo=2026-11-02&accountId=50&token=secret"
    ),
    context()
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].path,
    "/workspaces/900/integrations/google-ads/report?dateFrom=2026-11-01&dateTo=2026-11-02&accountId=50"
  );
  assert.equal(calls[0].init.method, "GET");
});

test("BFF rejects invalid report requests before proxying and preserves onboarding query behavior", async () => {
  calls.length = 0;
  assert.equal(
    (
      await GET(
        new Request(
          "http://localhost/api/report?dateFrom=2026-01-01&dateTo=2026-04-03"
        ),
        context()
      )
    ).status,
    400
  );
  assert.equal(
    (await GET(new Request("http://localhost/api/report"), context())).status,
    400
  );
  assert.equal(
    (
      await GET(
        new Request("http://localhost/api/report"),
        context(["report"], "../900")
      )
    ).status,
    404
  );
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/report", { method: "POST" }),
        context()
      )
    ).status,
    404
  );
  assert.equal(calls.length, 0);
  assert.equal(
    (
      await GET(
        new Request(
          "http://localhost/api/onboarding?connectionId=30&dateFrom=bad"
        ),
        context(["onboarding"])
      )
    ).status,
    200
  );
  assert.equal(
    calls.at(-1).path,
    "/workspaces/900/integrations/google-ads/onboarding?connectionId=30"
  );
  assert.equal(
    (
      await GET(
        new Request(
          "http://localhost/api/onboarding?connectionId=30&connectionId=31"
        ),
        context(["onboarding"])
      )
    ).status,
    400
  );
});

test("standalone fixture supports auth, state changes, filtered reports, and viewer workspaces", async (t) => {
  const server = createReportFixtureServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await (await fetch(`${base}/auth/login`, { method: "POST" })).json())
      .tokenType,
    "Bearer"
  );
  assert.equal(
    (await (await fetch(`${base}/auth/refresh`, { method: "POST" })).json())
      .tokenType,
    "Bearer"
  );
  const oauth = await fetch(`${base}/auth/oauth/google`, {
    redirect: "manual",
  });
  assert.equal(oauth.status, 302);
  assert.equal(
    oauth.headers.get("location"),
    "http://127.0.0.1:3102/api/auth/oauth/callback?code=fixture-only"
  );
  assert.equal(
    (
      await (
        await fetch(`${base}/auth/oauth/exchange`, {
          method: "POST",
          body: JSON.stringify({ code: "fixture-only" }),
        })
      ).json()
    ).tokenType,
    "Bearer"
  );
  assert.equal((await (await fetch(`${base}/auth/me`)).json()).id, "900");
  assert.deepEqual(
    await (await fetch(`${base}/workspaces/invitations`)).json(),
    []
  );
  assert.equal(
    (await (await fetch(`${base}/workspaces`)).json())[1].role,
    "viewer"
  );
  for (const scenario of [
    "populated",
    "empty",
    "error",
    "partial",
    "multi_currency",
  ]) {
    await fetch(`${base}/__test/state`, {
      method: "POST",
      body: JSON.stringify({ scenario }),
    });
    const response = await fetch(
      `${base}/workspaces/900/integrations/google-ads/report?dateFrom=2026-11-01&dateTo=2026-11-02`
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(isGoogleAdsReport(await response.json()), true, scenario);
  }
  const single = await (
    await fetch(
      `${base}/workspaces/901/integrations/google-ads/report?dateFrom=2026-11-01&dateTo=2026-11-02&accountId=51`
    )
  ).json();
  assert.equal(single.workspaceId, "901");
  assert.deepEqual(
    single.accounts.map((account) => account.accountId),
    ["51"]
  );
});
