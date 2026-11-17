import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import {
  buildFixtureReport,
  fixtureWorkspaces,
} from "./fixtures/google-ads-report-backend.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
async function loadTs(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (id) => (Object.hasOwn(dependencies, id) ? dependencies[id] : require(id)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const reportHelpers = await loadTs("../lib/integrations/google-ads-report.ts");
const overviewHelpers = await loadTs(
  "../lib/integrations/dashboard-overview.ts",
  {
    "./google-ads-report": reportHelpers,
  },
);
const { deriveDashboardOverview, overviewDays, overviewWeekday } =
  overviewHelpers;
const { DashboardOverview } = await loadTs(
  "../components/dashboard/dashboard-overview.tsx",
  {
    "@/lib/integrations/google-ads-report": reportHelpers,
    "@/lib/integrations/dashboard-overview": overviewHelpers,
    "@/components/auth/logout-button": {
      LogoutButton: () =>
        React.createElement("button", { "aria-label": "로그아웃" }, "로그아웃"),
    },
    "@/components/public/site-frame": {
      PolicyLinks: () =>
        React.createElement(
          "nav",
          { "aria-label": "서비스 정책" },
          React.createElement("a", { href: "/privacy" }, "개인정보처리방침"),
          React.createElement("a", { href: "/terms" }, "이용약관"),
        ),
    },
    "./dashboard-overview.module.css": {
      __esModule: true,
      default: new Proxy({}, { get: (_, key) => String(key) }),
    },
    "next/link": ({ children, ...props }) =>
      React.createElement("a", props, children),
  },
);

function pausedReport() {
  const report = buildFixtureReport({ scenario: "empty" });
  const account = report.accounts[0];
  account.name = "testaccount3";
  account.customerId = "6687440172";
  account.campaigns = [
    {
      id: "paused-test",
      name: "GrowdoAds 대시보드 연결 테스트",
      status: "PAUSED",
      primaryStatus: "PAUSED",
      channel: "SEARCH",
      budgetMicros: "1000000000",
      budgetPeriod: "DAILY",
      metrics: { ...account.totals },
    },
  ];
  report.accounts = [account];
  report.summaries[0].accountIds = [account.accountId];
  return report;
}

function render(report, extra = {}) {
  return renderToStaticMarkup(
    React.createElement(DashboardOverview, {
      report,
      loading: false,
      workspace: fixtureWorkspaces[0],
      onRefresh() {},
      ...extra,
    }),
  );
}

test("actual paused test-account scenario retains 1,000 KRW daily budget and zero activity", () => {
  const report = pausedReport();
  const overview = deriveDashboardOverview(report, "KRW");
  assert.equal(overview.allPaused, true);
  assert.equal(overview.allTest, true);
  assert.match(overview.status.title, /일시중지/);
  assert.doesNotMatch(overview.status.title, /정상|운영 중/);
  assert.equal(overview.summary.totals.clicks, 0);
  assert.equal(overview.summary.totals.conversions, 0);
  assert.equal(overview.summary.totals.costMicros, "0");
  assert.ok(overview.days.every((day) => day.clicks === 0));
  assert.equal(overview.campaigns[0].account.customerId, "6687440172");
  const html = render(report);
  assert.match(html, /GrowdoAds 대시보드 연결 테스트/);
  assert.match(html, /KRW\s*1,000/);
  assert.match(html, /일일 예산/);
  assert.match(html, /게재 상태: 일시중지/);
  assert.match(
    html,
    /조회된 계정 데이터만으로 실제 광고 게재·과금을 확인할 수 없어요/,
  );
  assert.doesNotMatch(html, /124명|29,000|34%|정상적으로 운영/);
});

test("partial failures never enter totals, chart, campaigns, or successful-account count", () => {
  const report = buildFixtureReport({ scenario: "partial" });
  const failed = report.accounts[1];
  failed.campaigns = [structuredClone(report.accounts[0].campaigns[0])];
  failed.campaigns[0].name = "실패 계정 캠페인 제외 검증";
  const overview = deriveDashboardOverview(report, "KRW");
  assert.equal(overview.successful.length, 1);
  assert.equal(overview.failed.length, 1);
  assert.deepEqual(overview.summary.accountIds, ["50"]);
  assert.deepEqual(overview.summary.totals, report.accounts[0].totals);
  assert.ok(overview.rows.every((row) => row.account.accountId === "50"));
  const html = render(report);
  assert.match(html, /일부 계정의 성과/);
  assert.match(html, /조회 실패 1개 제외/);
  assert.doesNotMatch(html, /실패 계정 캠페인 제외 검증/);
  report.summaries[0].accountIds.push(failed.accountId);
  assert.equal(deriveDashboardOverview(report, "KRW").summary, undefined);
});

test("all-test empty accounts show real zero spend without implying live delivery", () => {
  const report = buildFixtureReport({ scenario: "empty" });
  const overview = deriveDashboardOverview(report, "KRW");
  assert.equal(overview.allTest, true);
  assert.equal(overview.testCount, 2);
  assert.equal(overview.summary.totals.costMicros, "0");
  assert.equal(overview.allPaused, false);
  assert.equal(overview.campaigns.length, 0);
  const html = render(report);
  assert.match(html, /KRW\s*0/);
  assert.match(html, /실제 광고 게재·과금을 확인할 수 없어요/);
  assert.match(html, /조회된 캠페인이 없어요/);
  assert.doesNotMatch(html, /정상적으로 운영|광고 중/);
});

test("currency selection never combines money, conversions, clicks, or campaign currencies", () => {
  const report = buildFixtureReport({ scenario: "multi_currency" });
  const krw = deriveDashboardOverview(report, "KRW");
  const usd = deriveDashboardOverview(report, "USD");
  assert.equal(krw.summaries.length, 2);
  assert.deepEqual(krw.summary.totals, report.accounts[0].totals);
  assert.deepEqual(usd.summary.totals, report.accounts[1].totals);
  assert.ok(krw.rows.every((row) => row.account.currency === "KRW"));
  assert.ok(usd.rows.every((row) => row.account.currency === "USD"));
  assert.equal(deriveDashboardOverview(report, "JPY").summary.currency, "KRW");
  assert.equal(krw.campaigns.length, 6);
  const html = render(report, {
    workspace: { ...fixtureWorkspaces[0], defaultCurrency: "USD" },
  });
  assert.match(html, /집계 통화/);
  assert.match(html, /USD 계정만 집계/);
  assert.match(html, /USD 계정의 보고된 전환/);
});

test("seven chart dates end on the selected period, not the current day", () => {
  const report = buildFixtureReport({
    dateFrom: "2024-02-28",
    dateTo: "2024-03-02",
  });
  const days = overviewDays(report, report.summaries[0]);
  assert.deepEqual(
    days.map((day) => day.date),
    [
      "2024-02-25",
      "2024-02-26",
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
    ],
  );
  assert.ok(days.slice(0, 3).every((day) => day.clicks === null));
  assert.equal(days[6].clicks, report.summaries[0].daily.at(-1).clicks);
  report.summaries[0].daily = report.summaries[0].daily.filter(
    (day) => day.date !== "2024-02-29",
  );
  assert.equal(overviewDays(report, report.summaries[0])[4].clicks, null);
  assert.ok(overviewDays(report).every((day) => day.clicks === null));
});

test("unavailable totals and null budgets remain unavailable, not zero", () => {
  const report = pausedReport();
  report.accounts[0].totals = null;
  const overview = deriveDashboardOverview(report, "KRW");
  assert.equal(overview.summary, undefined);
  assert.ok(overview.days.every((day) => day.clicks === null));
  assert.match(render(report), /조회 가능한 성과 없음/);
  const budgetReport = pausedReport();
  budgetReport.accounts[0].campaigns[0].budgetMicros = null;
  budgetReport.accounts[0].campaigns[0].budgetPeriod = null;
  assert.match(render(budgetReport), /일일 예산 확인 불가/);
});

test("configured ENABLED campaigns retain primary restrictions without a serving claim", () => {
  const report = pausedReport();
  report.accounts[0].campaigns[0].status = "ENABLED";
  report.accounts[0].campaigns[0].primaryStatus = "NOT_ELIGIBLE";
  const html = render(report);
  assert.match(html, /사용 설정/);
  assert.match(html, /게재 상태: 게재 불가/);
  assert.doesNotMatch(html, /정상적으로 운영|광고 중/);
});

test("loading, login, missing report, no accounts, and full errors expose actionable states", () => {
  assert.match(render(pausedReport(), { loading: true }), /aria-busy="true"/);
  assert.doesNotMatch(
    render(pausedReport(), { loading: true }),
    /GrowdoAds 대시보드 연결 테스트/,
  );
  assert.match(render(undefined, { loginRequired: true }), /다시 로그인/);
  assert.match(render(undefined), /다시 불러오기/);
  const noAccounts = render(buildFixtureReport({ scenario: "no_accounts" }));
  assert.match(noAccounts, /연결된 Google Ads 계정이 없어요/);
  assert.match(noAccounts, /\/workspaces\/900\/advertising/);
  const failed = buildFixtureReport({ scenario: "error" });
  assert.equal(deriveDashboardOverview(failed, "KRW").summary, undefined);
  assert.match(render(failed), /Google 인증이 만료/);
  assert.doesNotMatch(render(failed), /KRW\s*0/);
});

test("mixed and unknown test flags are preserved; component performs no external writes", () => {
  const report = buildFixtureReport();
  report.accounts[1].testAccount = null;
  const overview = deriveDashboardOverview(report, "KRW");
  assert.equal(overview.allTest, false);
  assert.equal(overview.testCount, 1);
  assert.equal(overview.unknownTestCount, 1);
  const html = render(report);
  assert.match(
    html,
    /조회된 계정 데이터만으로 실제 광고 게재·과금을 확인할 수 없어요/,
  );
  assert.doesNotMatch(html, /테스트 계정|테스트 여부 미확인/);
  assert.match(html, /\/dashboard\/google-ads\?workspaceId=900#campaigns/);
  assert.doesNotMatch(html, /예산 변경|광고 시작|제안 살펴보기/);
});

function assertOriginalShell(html) {
  assert.doesNotMatch(html, /class="undefined/);
  assert.match(html, /id="top"/);
  assert.match(html, /<aside[^>]+w-\[248px\]/);
  assert.match(html, /<header[^>]+sticky top-0/);
  assert.match(html, /h-\[68px\]/);
  assert.match(html, /마지막 업데이트:/);
  assert.match(html, /광고가 어렵게 느껴지나요/);
  assert.match(html, /aria-label="로그아웃"/);
  assert.match(html, /aria-label="서비스 정책"/);
  assert.match(
    html,
    /mt-12 grid gap-5 lg:grid-cols-\[minmax\(0,1\.55fr\)_minmax\(280px,0\.72fr\)\]/,
  );
  assert.match(html, /id="performance"[^>]+rounded-\[28px\] bg-\[#18212f\]/);
  assert.match(
    html,
    /rounded-\[28px\] border border-\[#e7ded5\] bg-\[#fffdf9\] p-6 sm:p-7/,
  );
  assert.match(html, /grid gap-6 sm:grid-cols-3 sm:divide-x/);
  assert.match(html, /mt-6 overflow-hidden rounded-2xl border/);
  assert.match(html, /id="report"[^>]+rounded-\[24px\]/);
  for (const label of ["주요 메뉴", "모바일 주요 메뉴"]) {
    const nav = html.match(
      new RegExp(`<nav aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/nav>`),
    );
    assert.ok(nav, label);
    assert.equal((nav[1].match(/<a\s/g) ?? []).length, 4);
    assert.match(nav[1], /href="#top"/);
    assert.match(nav[1], /href="\/workspaces\/900\/campaigns"/);
    assert.match(nav[1], /href="\/dashboard\/google-ads\?workspaceId=900"/);
    assert.match(nav[1], /href="#report"/);
  }
  assert.doesNotMatch(
    html,
    /role="toolbar"|type="date"|이번 달|이번달|보고서 생성|리포트가 준비|가게를 확인했|124명|\+18%|34%/,
  );
}

test("loaded full page restores the literal original shell, panel classes, navigation, and fixed typography", async () => {
  const html = render(pausedReport());
  assertOriginalShell(html);
  assert.match(html, /text-\[32px\] lg:text-\[55px\]/);
  assert.match(html, /text-\[25px\] lg:text-\[38px\]/);
  assert.match(html, /최근 30일 광고 결과/);
  assert.match(html, /광고 클릭/);
  assert.match(html, /광고 일시중지/);
  assert.match(html, /광고 현황을/);
  assert.match(html, /조회 성공/);
  assert.equal(
    (html.match(/data-clicks="0" style="height:0%"/g) ?? []).length,
    7,
  );
  assert.equal((html.match(/bg-\[#ff8a5b\]/g) ?? []).length, 1);
  assert.equal((html.match(/bg-\[#344356\]/g) ?? []).length, 6);
  assert.doesNotMatch(html, /<select/);
  const strip = html.match(/<section id="report"[\s\S]*?<\/section>/)[0];
  assert.match(strip, /href="\/dashboard\/google-ads\?workspaceId=900"/);
  assert.doesNotMatch(strip, /href="#report"|준비됐어요|정리했어요/);
  const source = await readFile(
    new URL("../components/dashboard/dashboard-overview.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /import type \{ AuthUser \}/);
  assert.match(source, /import type \{ BillingPlan, Workspace \}/);
  assert.doesNotMatch(source, /clamp\(|tracking-\[-|fetch\(/);
  const css = await readFile(
    new URL(
      "../components/dashboard/dashboard-overview.module.css",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(css, /letter-spacing: 0/);
  assert.doesNotMatch(css, /border-radius: 8px/);
});

test("every unavailable state retains the entire original page and unknown metrics", () => {
  for (const [report, props] of [
    [undefined, {}],
    [undefined, { loginRequired: true }],
    [pausedReport(), { error: "연결 오류" }],
    [buildFixtureReport({ scenario: "error" }), {}],
    [buildFixtureReport({ scenario: "no_accounts" }), {}],
  ]) {
    const html = render(report, props);
    assertOriginalShell(html);
    assert.doesNotMatch(
      html,
      /정상적으로 운영|잘 일하고 있어요|KRW\s*0|data-clicks="0"|GrowdoAds 대시보드 연결 테스트/,
    );
    assert.match(html, /성과 확인이 필요해요/);
    assert.match(html, /height:0%/);
  }
});

test("loading preserves the original shell with one polite announcement and hidden placeholders, never empty or repair states", () => {
  for (const [report, props] of [
    [undefined, {}],
    [pausedReport(), {}],
    [buildFixtureReport({ scenario: "empty" }), {}],
    [buildFixtureReport({ scenario: "no_accounts" }), {}],
    [buildFixtureReport({ scenario: "partial" }), {}],
    [buildFixtureReport({ scenario: "error" }), {}],
    [pausedReport(), { error: "연결 오류", loginRequired: true }],
  ]) {
    const html = render(report, { ...props, loading: true });
    assertOriginalShell(html);
    assert.equal((html.match(/role="status"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1);
    const announcement = html.match(
      /<h2 role="status" aria-live="polite"[^>]*>([\s\S]*?)<\/h2>/,
    );
    assert.ok(announcement);
    assert.equal(
      announcement[1].replace(/<[^>]*>/g, ""),
      "광고 현황을 불러오고 있어요. 잠시만 기다려 주세요.",
    );
    assert.match(
      announcement[1],
      /<svg[^>]*loadingSpinner[^>]*aria-hidden="true"/,
    );
    assert.match(announcement[1], /lucide-loader-circle/);
    const skeletons = html.match(/<span[^>]*class="skeleton [^"]*"[^>]*>/g);
    assert.ok(skeletons?.length > 20);
    assert.ok(
      skeletons.every((element) => element.includes('aria-hidden="true"')),
    );
    for (const id of ["performance", "details", "campaigns"]) {
      const section = html.match(
        new RegExp(`<section id="${id}"[^>]*>([\\s\\S]*?)<\\/section>`),
      );
      assert.ok(section);
      assert.match(section[0], /aria-busy="true"/);
      assert.match(section[1], /class="skeleton /);
    }
    assert.match(html, /h-32 items-center/);
    assert.match(html, /loadingCampaigns/);
    assert.doesNotMatch(
      html,
      /—(?:회|건|개)|성과 확인이 필요해요|성과 확인 필요|조회 가능한 성과 없음|조회된 캠페인이 없어요|연결된 Google Ads 계정이 없어요|광고 상태 확인 필요|다시 로그인|다시 불러오기|연결 오류|조회 실패|role="alert"|data-clicks=|role="img"|height:0%|KRW\s*0|GrowdoAds 대시보드 연결 테스트/,
    );
    assert.doesNotMatch(
      html,
      /캠페인 만들기|자세한 성과|상세 성과 보기|모두 보기|광고계정 확인|연결 확인|광고계정 연결|요금제 확인|<select/,
    );
  }
});

test("loading retains only known service list pricing, and completion replaces skeletons with real zero or distinct recovery states", () => {
  const plan = {
    code: "team",
    name: "팀",
    priceAmount: 42000,
    currency: "KRW",
    billingInterval: "month",
  };
  const loadingHtml = render(undefined, { loading: true, plan });
  assert.match(loadingHtml, /KRW 42,000/);
  assert.match(loadingHtml, /월 정가 · 실제 청구액 아님/);

  const zero = render(pausedReport());
  assert.match(zero, /0회/);
  assert.match(zero, /0건/);
  assert.match(zero, /data-clicks="0" style="height:0%"/);
  for (const [report, props, message] of [
    [pausedReport(), {}, /조회된 클릭 수예요/],
    [
      buildFixtureReport({ scenario: "no_accounts" }),
      {},
      /연결된 Google Ads 계정이 없어요/,
    ],
    [undefined, {}, /광고 상태를 아직 확인하지 못했어요/],
    [undefined, { error: "연결 오류" }, /광고 현황을 불러오지 못했어요/],
    [undefined, { loginRequired: true }, /다시 로그인해 주세요/],
  ]) {
    const html = render(report, props);
    assertOriginalShell(html);
    assert.match(html, message);
    assert.doesNotMatch(
      html,
      /class="skeleton |loadingSpinner|aria-busy="true"|aria-live="polite"/,
    );
  }
});

test("loading motion is subtle, reserves chart and campaign space, and respects reduced motion", async () => {
  const css = await readFile(
    new URL(
      "../components/dashboard/dashboard-overview.module.css",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(css, /\.loadingCampaigns\s*\{\s*min-height: 212px;/);
  assert.match(
    css,
    /@media \(min-width: 640px\)\s*\{\s*\.loadingCampaigns\s*\{\s*min-height: 124px;/,
  );
  assert.match(css, /@keyframes loading-pulse\s*\{\s*50%\s*\{\s*opacity:/);
  assert.match(
    css,
    /@keyframes loading-spin\s*\{\s*to\s*\{\s*transform: rotate\(360deg\)/,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.skeleton,\s*\.loadingSpinner\s*\{\s*animation: none;/,
  );
});

test("user identity, admin access, invitation count, and real timestamp use the new props", () => {
  const report = pausedReport();
  report.fetchedAt = "2026-11-02T01:24:00Z";
  const html = render(report, {
    homeUser: {
      id: "u1",
      email: "owner@example.com",
      displayName: "김사장",
      isPlatformAdmin: true,
    },
    invitationsCount: 3,
  });
  assert.match(html, /김사장/);
  assert.match(html, /title="플랫폼 관리" aria-label="플랫폼 관리"/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /href="\/workspaces\/900\/settings"/);
  assert.match(
    html,
    /href="\/invitations" title="초대 알림 3개" aria-label="초대 알림 3개"/,
  );
  assert.match(html, /26\. 11\. 2\. 오전 10:24/);
  const fallback = render(report, {
    homeUser: {
      id: "u2",
      email: "owner@example.com",
      displayName: "  ",
      isPlatformAdmin: false,
    },
  });
  assert.match(fallback, /owner@example.com/);
  assert.doesNotMatch(
    fallback,
    /href="\/admin"|초대 알림 3개|TEST_USER|오늘 오전 10:24/,
  );
});

test("service fee is supplied monthly or yearly list pricing, never an assumed payment", () => {
  for (const billingInterval of ["month", "year"]) {
    const html = render(pausedReport(), {
      plan: {
        code: "team",
        name: "팀",
        priceAmount: 42000,
        currency: "KRW",
        billingInterval,
      },
    });
    assert.match(html, /GrowdoAds 이용료/);
    assert.match(html, /KRW 42,000/);
    assert.match(
      html,
      new RegExp(
        `${billingInterval === "month" ? "월" : "연"} 정가 · 실제 청구액 아님`,
      ),
    );
    assert.doesNotMatch(html, /29,000|결제됐|청구됐/);
  }
  const html = render(pausedReport(), { plan: null });
  assert.match(html, /요금제 확인/);
  assert.doesNotMatch(html, /29,000|월 정가|연 정가/);
});

test("chart dates calculate weekdays across leap day and preserve real nonzero bar heights", () => {
  assert.equal(overviewWeekday("2024-02-29"), "목");
  assert.equal(overviewWeekday("2024-03-02"), "토");
  assert.equal(overviewWeekday("invalid"), "");
  const report = pausedReport();
  const clicks = [0, 2, 0, 4, 6, 8, 0];
  report.summaries[0].daily.slice(-7).forEach((day, index) => {
    day.clicks = clicks[index];
  });
  const html = render(report);
  assert.match(html, /data-clicks="2" style="height:25%"/);
  assert.match(html, /data-clicks="8" style="height:100%"/);
  assert.equal(
    (html.match(/data-clicks="0" style="height:0%"/g) ?? []).length,
    3,
  );
});

test("zero activity and mismatched workspace data never imply normal delivery", () => {
  const report = pausedReport();
  report.accounts[0].campaigns[0].status = "ENABLED";
  assert.equal(deriveDashboardOverview(report, "KRW").noActivity, true);
  assert.match(render(report), /최근 30일 광고 활동이 없어요/);
  const html = render(report, {
    workspace: { ...fixtureWorkspaces[0], id: "other" },
  });
  assert.match(html, /광고 상태를 아직 확인하지 못했어요/);
  assert.doesNotMatch(html, /GrowdoAds 대시보드 연결 테스트|KRW\s*0/);
});
