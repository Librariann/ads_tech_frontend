import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { buildFixtureReport, fixtureWorkspaces } from "./fixtures/google-ads-report-backend.mjs";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
async function loadTs(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (id) => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), loaded, loaded.exports,
  );
  return loaded.exports;
}
const adHelpers = await loadTs("../lib/integrations/google-ads-search-ad.ts");
const helpers = await loadTs("../lib/integrations/google-ads-campaign.ts", { "./google-ads-search-ad": adHelpers });
const {
  parseDailyBudget, campaignBudgetText, campaignInput, isCampaignResult, campaignAccounts,
  canCreateCampaign, canStartNewCampaign, campaignStorageKey, parseCampaignDraft,
  submitCampaign, recoverCampaign, CampaignApiError, campaignErrorMessage, campaignApi,
} = helpers;
const input = {
  requestId: "12345678-1234-4234-8234-123456789abc", accountId: "3",
  name: "Paused test", dailyBudgetMicros: "1000000000",
};
const draft = (phase = "submitted") => ({ version: 1, input: { ...input }, phase });
const result = (status = "created", overrides = {}) => ({
  ...input, status, currency: "KRW", customerId: "6687440172",
  campaignId: status === "created" ? "1234567" : null,
  budgetResourceName: status === "created" ? "customers/6687440172/campaignBudgets/7654321" : null,
  errorCode: null, createdAt: "2026-11-02T00:00:00Z", updatedAt: "2026-11-02T00:01:00Z",
  searchAd: null, adGroupId: null, adResourceName: null, keywordResourceNames: [], ...overrides,
});
const notFound = () => { throw new CampaignApiError(undefined, 404); };

test("daily budget uses exact micros, including fractional account currency and upper boundary", () => {
  for (const [value, expected] of [
    ["1000", "1000000000"], ["0.000001", "1"], ["0.100001", "100001"],
    ["123456.123456", "123456123456"], ["999999.999999", "999999999999"],
    ["1000000", "1000000000000"], ["1000000.000000", "1000000000000"], [" 1.20 ", "1200000"],
  ]) {
    assert.equal(parseDailyBudget(value), expected);
    assert.equal(parseDailyBudget(campaignBudgetText(expected)), expected);
  }
});

test("micros parser rejects floats, scientific notation, separators, signs and out of range amounts", () => {
  for (const value of ["", " ", "0", "0.000000", "-1", "+1", "1e3", "1,000", "1_000", "0x10", ".1", "1.", "01", "1.0000001", "1000000.000001", "99999999", "NaN", "Infinity", "1\n2"]) {
    assert.equal(parseDailyBudget(value), null, value);
  }
});

test("input validator trims name and accepts only the four backend fields", () => {
  assert.deepEqual(campaignInput({ ...input, name: "  Paused test  " }), input);
  assert.equal(campaignInput({ ...input, requestId: input.requestId.toUpperCase() }).requestId, input.requestId);
  for (const forbidden of ["status", "channel", "currency", "customerId", "politicalAdvertising", "extra"]) {
    assert.equal(campaignInput({ ...input, [forbidden]: "ENABLED" }), null);
  }
  for (const invalid of [null, [], {}, { ...input, name: " " }, { ...input, name: "a".repeat(129) },
    { ...input, name: "a\nb" }, { ...input, name: "\tname" }, { ...input, name: "a\u007fb" },
    { ...input, requestId: "12345678-1234-1234-8234-123456789abc" },
    { ...input, requestId: "12345678-1234-4234-1234-123456789abc" },
    { ...input, accountId: 3 }, { ...input, accountId: "0" }, { ...input, accountId: "03" },
    { ...input, accountId: "../3" }, { ...input, dailyBudgetMicros: 1000000000 },
    { ...input, dailyBudgetMicros: "0" }, { ...input, dailyBudgetMicros: "1000000000001" },
    { ...input, dailyBudgetMicros: "1e9" }, { ...input, dailyBudgetMicros: "1.1" }]) {
    assert.equal(campaignInput(invalid), null);
  }
});

test("response validator accepts all statuses and nullable details, rejects malformed payloads", () => {
  for (const status of ["creating", "created", "unknown", "failed"]) assert.equal(isCampaignResult(result(status)), true);
  assert.equal(isCampaignResult(result("failed", { currency: null })), true);
  for (const value of [null, {}, result("ENABLED"), result("created", { campaignId: 1 }),
    result("created", { currency: "bad" }), result("created", { updatedAt: "bad" }),
    result("created", { dailyBudgetMicros: "1000000000001" }), result("created", { errorCode: {} })]) {
    assert.equal(isCampaignResult(value), false);
  }
});

test("created response requires trustworthy customer, campaign, matching budget resource and currency", () => {
  assert.equal(isCampaignResult(result("created", {
    campaignId: "24419981435", budgetResourceName: "customers/6687440172/campaignBudgets/16002578593",
  })), true);
  for (const changes of [
    { customerId: "123" }, { customerId: "668-744-0172" }, { customerId: "6687440172\n" },
    { campaignId: null }, { campaignId: "0" }, { campaignId: "001" }, { campaignId: "-1" },
    { campaignId: "1.5" }, { campaignId: "customers/6687440172/campaigns/1" },
    { budgetResourceName: null }, { budgetResourceName: "customers/1234567890/campaignBudgets/16002578593" },
    { budgetResourceName: "customers/6687440172/campaignBudgets/0" },
    { budgetResourceName: "customers/6687440172/campaigns/16002578593" },
    { budgetResourceName: "customers/6687440172/campaignBudgets/16002578593/extra" },
    { currency: null }, { currency: "krw" }, { currency: "KRW\n" },
    { errorCode: "GOOGLE_ADS_CAMPAIGN_REJECTED" },
  ]) assert.equal(isCampaignResult(result("created", changes)), false, JSON.stringify(changes));
  for (const status of ["unknown", "failed"]) {
    assert.equal(isCampaignResult(result(status, { campaignId: null, budgetResourceName: null, currency: null })), true);
  }
});

test("only registered healthy explicitly test accounts are selectable; viewer and unknown roles denied", () => {
  const report = buildFixtureReport();
  const source = report.accounts[0];
  report.accounts = [
    { ...source, accountId: "3", status: "ok", testAccount: true },
    { ...source, accountId: "4", status: "ok", testAccount: false },
    { ...source, accountId: "5", status: "ok", testAccount: null },
    { ...source, accountId: "6", status: "error", testAccount: true },
    { ...source, accountId: "0", status: "ok", testAccount: true },
  ];
  assert.deepEqual(campaignAccounts(report).map((account) => account.accountId), ["3"]);
  for (const role of ["owner", "admin", "marketer"]) assert.equal(canCreateCampaign(role), true);
  for (const role of ["viewer", "", "platform_admin"]) assert.equal(canCreateCampaign(role), false);
});

test("versioned drafts round trip without auth data and are scoped to user and workspace", () => {
  assert.deepEqual(parseCampaignDraft(JSON.stringify(draft())), draft());
  assert.notEqual(campaignStorageKey("1", "user1"), campaignStorageKey("2", "user1"));
  assert.notEqual(campaignStorageKey("1", "user1"), campaignStorageKey("1", "user2"));
  assert.deepEqual(Object.keys(draft()).sort(), ["input", "phase", "version"]);
  for (const text of ["null", "[]", "bad", JSON.stringify({ ...draft(), version: 2 }), JSON.stringify({ ...draft(), phase: "ready" }), JSON.stringify({ ...draft(), input: { ...input, status: "ENABLED" } })]) {
    assert.equal(parseCampaignDraft(text), null);
  }
});

test("a POST is preceded by durable persistence, and completion retains the same request ID", async () => {
  const events = [];
  const state = await submitCampaign(draft(), {
    create: async (value) => { events.push(["POST", value]); return result(); }, lookup: notFound,
  }, (value) => events.push(["save", structuredClone(value)]));
  assert.equal(events[0][0], "save");
  assert.equal(events[1][0], "POST");
  assert.deepEqual(events[1][1], input);
  assert.equal(state.draft.phase, "created");
  assert.equal(state.draft.input.requestId, input.requestId);
});

test("storage failure prevents POST entirely", async () => {
  let calls = 0;
  await assert.rejects(submitCampaign(draft(), { create: async () => { calls++; return result(); }, lookup: notFound }, () => { throw new Error("storage unavailable"); }), /storage/);
  assert.equal(calls, 0);
});

test("lost POST response queries the persisted ID and recovers a created campaign without another POST", async () => {
  const events = [];
  const state = await submitCampaign(draft(), {
    create: async () => { events.push("POST"); throw new TypeError("Failed to fetch"); },
    lookup: async (id) => { events.push(`GET:${id}`); return result(); },
  }, () => {});
  assert.deepEqual(events, ["POST", `GET:${input.requestId}`]);
  assert.equal(state.draft.phase, "created");
  assert.equal(state.error, "");
});

test("refresh only performs GET and missing network-failed request permits explicit same-key retry", async () => {
  let posts = 0;
  const api = { create: async (value) => { posts++; assert.deepEqual(value, input); return result(); }, lookup: notFound };
  const restored = await recoverCampaign(parseCampaignDraft(JSON.stringify(draft())), api, () => {});
  assert.equal(posts, 0);
  assert.equal(restored.draft.phase, "retryable");
  const completed = await submitCampaign(restored.draft, api, () => {});
  assert.equal(posts, 1);
  assert.equal(completed.draft.input.requestId, input.requestId);
});

test("unknown result code is durably locked even when status lookup returns 404", async () => {
  const saved = [];
  let posts = 0;
  const api = {
    create: async () => { posts++; throw new CampaignApiError("GOOGLE_ADS_CAMPAIGN_RESULT_UNKNOWN", 409); }, lookup: notFound,
  };
  const state = await submitCampaign(draft(), api, (value) => saved.push(structuredClone(value)));
  assert.equal(posts, 1);
  assert.equal(state.draft.phase, "unknown");
  assert.equal(canStartNewCampaign(state.draft), false);
  assert.equal(saved.at(-1).phase, "unknown");
  const restored = await recoverCampaign(parseCampaignDraft(JSON.stringify(saved.at(-1))), api, () => {});
  assert.equal(restored.draft.phase, "unknown");
  await assert.rejects(submitCampaign(restored.draft, api, () => {}), /locked/);
  assert.equal(posts, 1);
});

test("unknown 200 response and pending/conflict errors never unlock POST or new intent", async () => {
  for (const [code, phase] of [["GOOGLE_ADS_CAMPAIGN_PENDING", "creating"], ["GOOGLE_ADS_CAMPAIGN_REQUEST_CONFLICT", "conflict"]]) {
    const state = await submitCampaign(draft(), { create: async () => { throw new CampaignApiError(code, 409); }, lookup: notFound }, () => {});
    assert.equal(state.draft.phase, phase);
    assert.equal(canStartNewCampaign(state.draft), false);
    await assert.rejects(submitCampaign(state.draft, { create: async () => result(), lookup: notFound }, () => {}), /locked/);
  }
  const state = await submitCampaign(draft(), { create: async () => result("unknown"), lookup: notFound }, () => {});
  assert.equal(state.draft.phase, "unknown");
});

test("GET unknown errors also lock the draft; only authoritative terminal responses allow new intent", async () => {
  const uncertain = await recoverCampaign(draft(), { create: async () => result(), lookup: async () => { throw new CampaignApiError("GOOGLE_ADS_CAMPAIGN_RESULT_UNKNOWN", 409); } }, () => {});
  assert.equal(uncertain.draft.phase, "unknown");
  const stillPending = await recoverCampaign(uncertain.draft, { lookup: async () => result("creating") }, () => {});
  assert.equal(stillPending.draft.phase, "unknown");
  for (const status of ["created", "failed"]) {
    const state = await recoverCampaign(uncertain.draft, { lookup: async () => result(status) }, () => {});
    assert.equal(canStartNewCampaign(state.draft), true);
  }
});

test("lookup identity mismatch fails closed and changed persisted input is shown as conflict", async () => {
  const changed = await recoverCampaign(draft(), { lookup: async () => result("created", { name: "Other intent" }) }, () => {});
  assert.equal(changed.draft.phase, "conflict");
  assert.equal(changed.result.name, "Other intent");
  assert.equal(canStartNewCampaign(changed.draft), false);
  const wrong = await recoverCampaign(draft(), { lookup: async () => result("created", { requestId: "87654321-1234-4234-8234-123456789abc" }) }, () => {});
  assert.equal(wrong.result, null);
  assert.equal(wrong.draft.phase, "submitted");
});

test("reauth does not become logout; entitlement and disabled errors retain safe actionable text", async () => {
  for (const code of ["TEST_CAMPAIGNS_DISABLED", "GOOGLE_ADS_TEST_ACCOUNT_REQUIRED", "GOOGLE_ADS_REAUTH_REQUIRED", "ACTIVE_SUBSCRIPTION_REQUIRED", "ENTITLEMENT_LIMIT_EXCEEDED"]) {
    assert.notEqual(campaignErrorMessage(code, 403), campaignErrorMessage(undefined, 403));
  }
  const api = { lookup: async () => { throw new CampaignApiError("GOOGLE_ADS_REAUTH_REQUIRED", 401); } };
  assert.equal((await recoverCampaign(draft(), api, () => {})).loginRequired, false);
  api.lookup = async () => { throw new CampaignApiError(undefined, 401); };
  assert.equal((await recoverCampaign(draft(), api, () => {})).loginRequired, true);
});

test("provider errors map to Korean next steps rather than generic 400 failures", () => {
  for (const [code, expected] of [
    ["GOOGLE_ADS_CAMPAIGN_REJECTED", /이름과 예산/],
    ["GOOGLE_ADS_PERMISSION_DENIED", /계정 권한/],
    ["GOOGLE_ADS_RATE_LIMITED", /잠시 후 저장된 요청 상태/],
    ["GOOGLE_ADS_UPSTREAM_UNAVAILABLE", /새로 생성하지 말고/],
    ["GOOGLE_ADS_UPSTREAM_ERROR", /요청 상태와 보고서/],
  ]) {
    assert.match(campaignErrorMessage(code, 400), expected);
    assert.notEqual(campaignErrorMessage(code, 400), campaignErrorMessage(undefined, 400));
  }
});

test("HTTP client uses only same-origin BFF endpoints with no-store and four-field POST", async (t) => {
  const calls = [];
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json(result()); };
  const api = campaignApi("900");
  await api.create(input);
  await api.lookup(input.requestId);
  assert.equal(calls[0].url, "/api/workspaces/900/integrations/google-ads/campaigns");
  assert.deepEqual(JSON.parse(calls[0].init.body), input);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[1].init.method, undefined);
  assert.match(calls[1].url, /campaigns\/requests\/12345678/);
  for (const { init } of calls) { assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "same-origin"); }
});

test("unsafe success payload is never surfaced as created and is recovered only through GET", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    calls.push(init?.method ?? "GET");
    return init?.method === "POST" ? Response.json(result("created", { campaignId: null })) : Response.json(result("unknown"));
  };
  const recovered = await submitCampaign(draft(), campaignApi("900"), () => {});
  assert.deepEqual(calls, ["POST", "GET"]);
  assert.equal(recovered.draft.phase, "unknown");
  assert.notEqual(recovered.result?.status, "created");
  assert.equal(canStartNewCampaign(recovered.draft), false);
});

const proxyCalls = [];
let proxyStatus = 200;
const route = await loadTs("../app/api/workspaces/[workspaceId]/integrations/google-ads/[...path]/route.ts", {
  "next/server": { NextResponse: Response },
  "@/lib/integrations/google-ads-report": await loadTs("../lib/integrations/google-ads-report.ts"),
  "@/lib/integrations/google-ads-campaign": helpers,
  "@/lib/auth/proxy": { proxyAuthenticatedJson: async (path, init) => {
    proxyCalls.push({ path, init });
    const response = Response.json(proxyStatus === 200 ? result() : { code: "FORBIDDEN" }, { status: proxyStatus });
    response.headers.set("Set-Cookie", "access_token=refreshed; HttpOnly");
    return response;
  } },
});
const context = (path = ["campaigns"], workspaceId = "900") => ({ params: Promise.resolve({ workspaceId, path }) });
function post(body = input, headers = {}, query = "") {
  return new Request(`http://localhost/api/campaigns${query}`, {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

test("BFF forwards normalized four-field POST and UUID GET through auth proxy, no-store on both", async () => {
  proxyCalls.length = 0;
  const created = await route.POST(post({ ...input, name: " Paused test " }), context());
  assert.equal(created.status, 200);
  assert.deepEqual(JSON.parse(proxyCalls[0].init.body), input);
  assert.equal(proxyCalls[0].init.cache, "no-store");
  assert.equal(proxyCalls[0].path, "/workspaces/900/integrations/google-ads/campaigns");
  const status = await route.GET(new Request("http://localhost/api/campaigns"), context(["campaigns", "requests", input.requestId]));
  assert.equal(proxyCalls[1].path, `/workspaces/900/integrations/google-ads/campaigns/requests/${input.requestId}`);
  assert.equal(proxyCalls[1].init.body, undefined);
  for (const response of [created, status]) {
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Set-Cookie"), /refreshed/);
  }
});

test("BFF rejects body injection, invalid ID, controls, micros overflow, non-JSON and oversized bodies before proxy", async () => {
  proxyCalls.length = 0;
  for (const body of [{ ...input, status: "ENABLED" }, { ...input, channel: "DISPLAY" }, { ...input, currency: "USD" }, { ...input, name: "bad\nname" }, { ...input, requestId: "not-a-uuid" }, { ...input, dailyBudgetMicros: "1000000000001" }, { ...input, accountId: 3 }, []]) {
    const response = await route.POST(post(body), context());
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  assert.equal((await route.POST(post(input, { "content-type": "text/plain" }), context())).status, 415);
  assert.equal((await route.POST(post({ ...input, name: "a".repeat(16 * 1024) }), context())).status, 413);
  assert.equal((await route.POST(new Request("http://localhost/api/campaigns", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" }), context())).status, 400);
  assert.equal(proxyCalls.length, 0);
});

test("BFF rejects missing/foreign origins, cross-site fetches, query strings and invalid route shapes", async () => {
  proxyCalls.length = 0;
  for (const headers of [{ origin: "http://evil.test" }, { origin: "null" }, { origin: "" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }]) {
    assert.equal((await route.POST(post(input, headers), context())).status, 403);
  }
  assert.equal((await route.POST(post(input, {}, "?status=ENABLED"), context())).status, 400);
  for (const path of [["campaigns"], ["campaigns", "requests", "bad"], ["campaigns", "requests", input.requestId, "extra"], ["campaigns", `requests/${input.requestId}`]]) {
    assert.equal((await route.GET(new Request("http://localhost/api/campaigns"), context(path))).status, 404);
  }
  assert.equal((await route.POST(post(), context(["campaigns"], "../900"))).status, 404);
  assert.equal((await route.POST(post(), context(["campaigns", "requests", input.requestId]))).status, 404);
  assert.equal((await route.GET(new Request("http://localhost/api/campaigns?x=1"), context(["campaigns", "requests", input.requestId]))).status, 400);
  assert.equal(proxyCalls.length, 0);
});

test("backend membership and account authorization denial passes through BFF without caching", async () => {
  proxyStatus = 403;
  try {
    const response = await route.POST(post(), context());
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "FORBIDDEN" });
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  } finally { proxyStatus = 200; }
});

test("server page denies viewers before mounting the form and allows owner/admin/marketer", async () => {
  let role = "viewer";
  const Page = (await loadTs("../app/workspaces/[workspaceId]/campaigns/new/page.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/components/campaigns/google-ads-campaign-form": { GoogleAdsCampaignForm: () => React.createElement("form", { "data-campaign-form": true }) },
    "@/lib/integrations/google-ads-campaign": helpers,
    "@/lib/integrations/google-ads-campaign-server": { getCurrentUser: async () => ({ id: "user1" }) },
    "@/lib/workspaces/server": { getWorkspaces: async () => [{ ...fixtureWorkspaces[0], id: "900", role }] },
  })).default;
  const props = { params: Promise.resolve({ workspaceId: "900" }) };
  const viewer = renderToStaticMarkup(await Page(props));
  assert.match(viewer, /생성 권한이 없습니다/);
  assert.doesNotMatch(viewer, /data-campaign-form/);
  assert.match(viewer, /검색 · 일시중지/);
  assert.doesNotMatch(viewer, /테스트 계정/);
  assert.match(viewer, /dashboard\?workspaceId=900/);
  for (role of ["owner", "admin", "marketer"]) assert.match(renderToStaticMarkup(await Page(props)), /data-campaign-form/);
  await assert.rejects(Page({ params: Promise.resolve({ workspaceId: "0" }) }), /not found/);
});

test("home CTA changes only destination/label; existing top account-connect action is retained", async () => {
  const source = await readFile(new URL("../components/dashboard/dashboard-overview.tsx", import.meta.url), "utf8");
  assert.match(source, /href=\{`\/workspaces\/\$\{encodeURIComponent\(workspace.id\)\}\/campaigns\/new`\}/);
  assert.match(source, /캠페인 만들기/);
  assert.match(source, /href: setupHref, label: "광고계정 연결", icon: Plus/);
});

test("campaign display uses plain political declaration and collapses technical identifiers", async () => {
  const source = await readFile(new URL("../components/campaigns/google-ads-campaign-form.tsx", import.meta.url), "utf8");
  assert.match(source, /정치광고 여부/);
  assert.match(source, /해당 없음/);
  assert.doesNotMatch(source, /비정치 · 테스트 골격/);
  const details = source.slice(source.indexOf("<details"), source.indexOf("</details>") + 10);
  assert.match(details, /<summary[^>]*>요청 상세 및 식별자<\/summary>/);
  for (const label of ["요청 ID", "연결 계정 ID", "캠페인 ID", "예산 micros", "예산 리소스"]) assert.ok(details.includes(label));
  assert.doesNotMatch(details, /\bopen[= >]/);
});

test("campaign header uses labelled 44px mobile icon targets and desktop text", async () => {
  const source = await readFile(new URL("../app/workspaces/[workspaceId]/campaigns/new/page.tsx", import.meta.url), "utf8");
  for (const label of ["광고 관리", "보고서", "광고계정 연결"]) {
    assert.ok(source.includes(`title="${label}" aria-label="${label}"`));
    assert.ok(source.includes(`<span className="hidden sm:inline">${label}</span>`));
  }
  assert.equal(source.match(/min-h-11 min-w-11/g)?.length, 3);
});

const searchAd = {
  adGroupName: "그로우두애즈 검색 광고", cpcBidMicros: "100000000",
  finalUrl: "https://ads-tech-frontend.vercel.app/",
  headlines: ["광고 현황 한눈에", "그로우두애즈", "간편한 광고 관리"],
  descriptions: ["여러 광고계정의 현황을 한곳에서 확인하세요.", "광고 문구와 키워드를 간편하게 관리하세요."],
  keywords: ["광고 관리", "구글 광고"], keywordMatchType: "EXACT",
};
const adInput = { ...input, searchAd };
const adResult = (status = "created", overrides = {}) => result(status, {
  searchAd,
  adGroupId: status === "created" ? "456" : null,
  adResourceName: status === "created" ? "customers/6687440172/adGroupAds/456~789" : null,
  keywordResourceNames: status === "created" ? ["customers/6687440172/adGroupCriteria/456~111", "customers/6687440172/adGroupCriteria/456~222"] : [],
  ...overrides,
});
const details = (overrides = {}) => ({
  campaignId: "1234567", adGroupId: "456", adGroupStatus: "PAUSED", adStatus: "PAUSED",
  adResourceName: "customers/6687440172/adGroupAds/456~789", finalUrls: [searchAd.finalUrl],
  headlines: searchAd.headlines, descriptions: searchAd.descriptions, cpcBidMicros: searchAd.cpcBidMicros,
  keywords: searchAd.keywords.map((text, index) => ({ text, matchType: "EXACT", status: "PAUSED", resourceName: `customers/6687440172/adGroupCriteria/456~${index ? "222" : "111"}` })),
  fetchedAt: "2026-11-02T01:00:00Z", ...overrides,
});

test("search ad normalization trims without rewriting URLs and keeps legacy input four-field only", () => {
  assert.deepEqual(campaignInput(adInput), adInput);
  const normalized = adHelpers.searchAdInput({ ...searchAd,
    adGroupName: ` ${searchAd.adGroupName} `, finalUrl: " https://EXAMPLE.com/Path?b=2&a=1 ",
    headlines: searchAd.headlines.map((text) => ` ${text} `),
    descriptions: searchAd.descriptions.map((text) => ` ${text} `), keywords: [" 광고 관리 ", " 구글 광고 "],
  });
  assert.deepEqual(normalized, { ...searchAd, finalUrl: "https://EXAMPLE.com/Path?b=2&a=1" });
  assert.equal(campaignInput({ ...input, searchAd: null }), null);
  assert.equal(campaignInput({ ...input, searchAd: undefined }), null);
  assert.deepEqual(Object.keys(campaignInput(input)), Object.keys(input));
  for (const key of ["status", "adStatus", "keywordStatus", "adGroupStatus", "customParameters"]) {
    assert.equal(campaignInput({ ...adInput, searchAd: { ...searchAd, [key]: "ENABLED" } }), null);
  }
});

test("public final URL permits only HTTPS DNS hosts with no ports, credentials or fragments", () => {
  for (const value of ["https://example.com", " https://EXAMPLE.com/a?x=1 ", "https://sub.example.co.kr/path", "https://광고.kr/", "https://example.c2"]) {
    assert.equal(adHelpers.publicHttpsUrl(value), true, value);
  }
  for (const value of [null, [], 1, "", "http://example.com", "//example.com", "https:example.com",
    "https://example.com:443/", "https://example.com:8443/", "https://user@example.com", "https://:pass@example.com", "https://@example.com",
    "https://example.com/#", "https://example.com/#x", "https://example.com\\evil", "https://example.com/a b", "https://example.com/\n",
    "https://localhost", "https://127.0.0.1", "https://192.168.1.2", "https://10.0.0.1", "https://169.254.169.254/", "https://[::1]", "https://[2001:4860:4860::8888]",
    "https://2130706433", "https://0x7f000001", "https://0177.0.0.1", "https://example", "https://example.1a", "https://example.c", "https://example.com.",
    "https://-bad.com", "https://bad-.com", "https://bad_name.com", `https://${"a".repeat(64)}.com`,
    ...["localhost", "local", "internal", "test", "invalid", "lan"].map((suffix) => `https://sub.${suffix}`),
  ]) assert.equal(adHelpers.publicHttpsUrl(value), false, String(value));
});

test("Google width uses string-width 4: Korean 2, ASCII 1, asset boundaries and NFKC case-insensitive duplicates", () => {
  assert.equal(adHelpers.googleAdWidth("한글"), 4);
  assert.equal(adHelpers.googleAdWidth(" abc 한 "), 6);
  assert.equal(adHelpers.googleAdWidth("😀"), 2);
  for (const [key, min, max, limit] of [["headlines", 3, 15, 30], ["descriptions", 2, 4, 90]]) {
    const atLimit = "가".repeat(limit / 2);
    assert.ok(adHelpers.searchAdInput({ ...searchAd, [key]: [atLimit, ...searchAd[key].slice(1)] }));
    assert.equal(adHelpers.searchAdInput({ ...searchAd, [key]: [atLimit + "a", ...searchAd[key].slice(1)] }), null);
    assert.ok(adHelpers.searchAdInput({ ...searchAd, [key]: Array.from({ length: max }, (_, i) => `문구 ${i}`) }));
    for (const value of [[], searchAd[key].slice(0, min - 1), Array.from({ length: max + 1 }, (_, i) => `Text ${i}`),
      "not array", null, [null, ...searchAd[key].slice(1)], [["nested"], ...searchAd[key].slice(1)],
      [" ", ...searchAd[key].slice(1)], ["{Keyword:광고}", ...searchAd[key].slice(1)],
      Array.from({ length: min }, (_, i) => i === 0 ? "ＡＤＳ" : i === 1 ? "ads" : "other"),
      Array.from({ length: min }, (_, i) => i === 0 ? " 광고 " : i === 1 ? "광고" : "다른 제목"),
    ]) assert.equal(adHelpers.searchAdInput({ ...searchAd, [key]: value }), null, `${key}: ${JSON.stringify(value)}`);
  }
});

test("all asset text rejects C0/C1 controls and forbidden invisible formats, including trimmed-edge controls", () => {
  const controls = [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => 0x7f + i),
    ...Array.from({ length: 5 }, (_, i) => 0x200b + i), ...Array.from({ length: 7 }, (_, i) => 0x2028 + i),
    ...Array.from({ length: 16 }, (_, i) => 0x2060 + i), 0xfeff];
  for (const point of controls) {
    const char = String.fromCodePoint(point);
    for (const key of ["adGroupName", "headlines", "descriptions", "keywords", "finalUrl"]) {
      const value = Array.isArray(searchAd[key]) ? [`${char}${searchAd[key][0]}`, ...searchAd[key].slice(1)] : `${char}${searchAd[key]}`;
      assert.equal(adHelpers.searchAdInput({ ...searchAd, [key]: value }), null, `${key} U+${point.toString(16)}`);
    }
  }
});

test("keyword count, character/word limits, wrappers, normalized uniqueness and match type fail closed", () => {
  assert.ok(adHelpers.searchAdInput({ ...searchAd, keywords: ["가".repeat(80)] }));
  assert.ok(adHelpers.searchAdInput({ ...searchAd, keywords: [Array(10).fill("word").join(" ")] }));
  assert.ok(adHelpers.searchAdInput({ ...searchAd, keywords: Array.from({ length: 20 }, (_, i) => `광고 ${i}`), keywordMatchType: "PHRASE" }));
  for (const keywords of [[], [" "], [1], [["nested"]], "광고", ["가".repeat(81)], [Array(11).fill("word").join(" ")],
    Array.from({ length: 21 }, (_, i) => `광고 ${i}`), ["Ads", " ＡＤＳ "], ["광고", " 광고 "],
    ...["[광고]", '"광고"', "광[고", "광고]", "{Keyword:광고}", "광고}"].map((text) => [text]),
  ]) assert.equal(adHelpers.searchAdInput({ ...searchAd, keywords }), null, JSON.stringify(keywords));
  assert.ok(adHelpers.searchAdInput({ ...searchAd, keywordMatchType: "BROAD" }));
  for (const keywordMatchType of ["UNKNOWN", "exact", "", null, ["EXACT"], {}]) {
    assert.equal(adHelpers.searchAdInput({ ...searchAd, keywordMatchType }), null);
  }
  for (const adGroupName of ["", " ", "a".repeat(129), null, []]) assert.equal(adHelpers.searchAdInput({ ...searchAd, adGroupName }), null);
  for (const cpcBidMicros of ["0", "-1", "1e3", "1.0", 100, "1000000000001", "1\n", "01"]) assert.equal(adHelpers.searchAdInput({ ...searchAd, cpcBidMicros }), null);
  assert.ok(campaignInput({ ...adInput, dailyBudgetMicros: "1", searchAd: { ...searchAd, cpcBidMicros: "1000000000000" } }));
});

test("form fields keep exact KRW amount strings; CRLF and blank keyword lines normalize safely", () => {
  const fields = { ...searchAd, bid: "100", keywords: "광고 관리\r\n\r\n 구글 광고 \n" };
  const validated = adHelpers.validateSearchAdFields(fields, parseDailyBudget(fields.bid));
  assert.deepEqual(validated.searchAd, searchAd);
  assert.deepEqual(validated.errors, {});
  for (const amount of ["100", "0.000001", "100.010001", "1000000"]) {
    const state = { ...fields, bid: amount };
    const checked = adHelpers.validateSearchAdFields(state, parseDailyBudget(state.bid));
    assert.equal(state.bid, amount);
    assert.equal(checked.searchAd.cpcBidMicros, parseDailyBudget(amount));
    assert.equal(checked.searchAd.cpcBidMicros, parseDailyBudget(campaignBudgetText(checked.searchAd.cpcBidMicros)));
  }
  for (const keywords of ["광고\n광고", "광고\n\t", "광고\n\ufeff", "광고\n[구글 광고]"]) {
    const bad = adHelpers.validateSearchAdFields({ ...fields, keywords }, parseDailyBudget(fields.bid));
    assert.equal(bad.searchAd, null);
    assert.ok(bad.errors.keywords);
  }
  assert.ok(adHelpers.validateSearchAdFields({ ...fields, bid: "1,000" }, null).errors.bid);
});

test("search-ad result requires exact new field shapes and matching customer/ad-group resources", () => {
  for (const status of ["created", "creating", "unknown", "failed"]) assert.equal(isCampaignResult(adResult(status)), true);
  for (const changes of [
    { searchAd: undefined }, { searchAd: [] }, { searchAd: { ...searchAd, headlines: ["only one"] } },
    { adGroupId: null }, { adGroupId: 456 }, { adGroupId: "0" }, { adGroupId: "456\n" },
    { adResourceName: null }, { adResourceName: "customers/6687440172/adGroupAds/999~789" },
    { adResourceName: "customers/1234567890/adGroupAds/456~789" }, { adResourceName: "customers/6687440172/adGroupAds/456~789\n" },
    { keywordResourceNames: null }, { keywordResourceNames: [] }, { keywordResourceNames: [null] },
    { keywordResourceNames: Array(2).fill("customers/6687440172/adGroupCriteria/456~111") },
    { keywordResourceNames: ["customers/6687440172/adGroupCriteria/999~111", "customers/6687440172/adGroupCriteria/456~222"] },
    { keywordResourceNames: ["customers/1234567890/adGroupCriteria/456~111", "customers/6687440172/adGroupCriteria/456~222"] },
    { status: ["created"] },
  ]) assert.equal(isCampaignResult(adResult("created", changes)), false, JSON.stringify(changes));
  for (const key of ["searchAd", "adGroupId", "adResourceName", "keywordResourceNames"]) {
    const missing = result(); delete missing[key];
    assert.equal(isCampaignResult(missing), false, key);
  }
  assert.equal(isCampaignResult(result("created", { adGroupId: "456" })), false);
});

test("legacy drafts replay their exact input without new properties, normalization, hash changes or created-draft removal", async () => {
  const { createHash } = await import("node:crypto");
  const original = { ...input, requestId: input.requestId.toUpperCase(), name: ` ${input.name} ` };
  const persisted = { version: 1, input: original, phase: "retryable" };
  const restored = parseCampaignDraft(JSON.stringify(persisted));
  const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.deepEqual(restored.input, original);
  const saves = [];
  const state = await submitCampaign(restored, { create: async (posted) => {
    assert.equal(hash(posted), hash(original));
    assert.deepEqual(Object.keys(posted), Object.keys(input));
    return result();
  } }, (saved) => saves.push(saved));
  assert.equal(state.draft.phase, "created");
  assert.equal(hash(state.draft.input), hash(original));
  const recovered = await recoverCampaign(parseCampaignDraft(JSON.stringify(state.draft)), { lookup: async () => result() }, (saved) => saves.push(saved));
  assert.equal(recovered.draft.phase, "created");
  assert.equal(hash(recovered.draft.input), hash(original));
  assert.equal(saves.every((saved) => hash(saved.input) === hash(original)), true);
});

test("new draft recovery compares every normalized searchAd field, not only campaign fields", async () => {
  const saved = { version: 1, input: adInput, phase: "submitted" };
  const okay = await recoverCampaign(saved, { lookup: async () => adResult("created", {
    searchAd: { ...searchAd, adGroupName: ` ${searchAd.adGroupName} `, headlines: searchAd.headlines.map((text) => ` ${text} `) },
  }) }, () => {});
  assert.equal(okay.draft.phase, "created");
  assert.deepEqual(parseCampaignDraft(JSON.stringify(okay.draft)).input, adInput);
  const changes = {
    adGroupName: "다른 그룹", cpcBidMicros: "1", finalUrl: "https://example.com/other",
    headlines: ["다른 제목", ...searchAd.headlines.slice(1)], descriptions: ["다른 설명", ...searchAd.descriptions.slice(1)],
    keywords: ["다른 키워드", "구글 광고"], keywordMatchType: "PHRASE",
  };
  for (const [key, changed] of Object.entries(changes)) {
    const state = await recoverCampaign(saved, { lookup: async () => adResult("created", { searchAd: { ...searchAd, [key]: changed } }) }, () => {});
    assert.equal(state.draft.phase, "conflict", key);
    assert.equal(canStartNewCampaign(state.draft), false);
    assert.deepEqual(state.draft.input, adInput);
  }
  assert.equal((await recoverCampaign(saved, { lookup: async () => result() }, () => {})).draft.phase, "conflict");
  assert.equal((await recoverCampaign(draft(), { lookup: async () => adResult() }, () => {})).draft.phase, "conflict");
});

test("new POST failure recovers the same complete persisted intent without duplicate creates", async () => {
  const calls = [];
  const source = { version: 1, input: adInput, phase: "submitted" };
  const state = await submitCampaign(source, {
    create: async (posted) => { calls.push(["POST", posted]); throw new Error("connection lost"); },
    lookup: async (id) => { calls.push(["GET", id]); return adResult(); },
  }, () => {});
  assert.deepEqual(calls, [["POST", adInput], ["GET", input.requestId]]);
  assert.deepEqual(state.draft.input, adInput);
  assert.equal(state.draft.phase, "created");
});

test("details read validates actual statuses and resource IDs without requiring extra adGroupName", () => {
  assert.equal(helpers.isCampaignDetails(details()), true);
  assert.equal(helpers.isCampaignDetails(details({ adStatus: "ENABLED", keywords: [] })), true);
  for (const changes of [{ adGroupId: "0" }, { campaignId: null }, { adStatus: [] }, { adGroupStatus: "created" },
    { adResourceName: "customers/6687440172/adGroupAds/999~789" }, { finalUrls: "https://example.com" },
    { headlines: [null] }, { descriptions: {} }, { cpcBidMicros: "1.5" }, { fetchedAt: "bad" },
    { keywords: [{}] }, { keywords: [{ ...details().keywords[0], resourceName: "customers/1234567890/adGroupCriteria/456~111" }] },
    { keywords: [{ ...details().keywords[0], matchType: ["EXACT"] }] },
  ]) assert.equal(helpers.isCampaignDetails(details(changes)), false, JSON.stringify(changes));
});

test("same-origin details client is on-demand, no-store, and rejects malformed or denied responses", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json(details()); };
  const api = campaignApi("900");
  assert.equal(calls.length, 0);
  assert.deepEqual(await api.details(input.requestId), details());
  assert.equal(calls[0].url, `/api/workspaces/900/integrations/google-ads/campaigns/requests/${input.requestId}/details`);
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.method, undefined);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(api.details(input.requestId), (error) => error.code === "CAMPAIGN_RESPONSE_INVALID");
  globalThis.fetch = async () => Response.json({ code: "GOOGLE_ADS_PERMISSION_DENIED" }, { status: 403 });
  await assert.rejects(api.details(input.requestId), (error) => error.status === 403 && error.code === "GOOGLE_ADS_PERMISSION_DENIED");
});

test("BFF permits only strict GET details route with UUID, no query, auth refresh and no-store", async () => {
  proxyCalls.length = 0;
  const path = ["campaigns", "requests", input.requestId, "details"];
  const response = await route.GET(new Request("http://localhost/api/campaigns"), context(path));
  assert.equal(response.status, 200);
  assert.equal(proxyCalls[0].path, `/workspaces/900/integrations/google-ads/campaigns/requests/${input.requestId}/details`);
  assert.equal(proxyCalls[0].init.method, "GET");
  assert.equal(proxyCalls[0].init.body, undefined);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(response.headers.get("Set-Cookie"), /refreshed/);
  proxyCalls.length = 0;
  assert.equal((await route.POST(post(), context(path))).status, 404);
  assert.equal((await route.GET(new Request("http://localhost/api/campaigns?x=1"), context(path))).status, 400);
  for (const bad of [[...path, "extra"], ["campaigns", "requests", "bad", "details"], ["campaigns", "requests", input.requestId, "details/"], ["campaigns", "requests", `${input.requestId}\n`, "details"]]) {
    assert.equal((await route.GET(new Request("http://localhost/api/campaigns"), context(bad))).status, 404);
  }
  assert.equal(proxyCalls.length, 0);
});

test("BFF accepts full RSA and 20 keywords above 4KiB, rejects invalid searchAd before proxy", async () => {
  proxyCalls.length = 0;
  const fullAd = { ...searchAd,
    headlines: Array.from({ length: 15 }, (_, i) => `제목${"가".repeat(11)}${i}`),
    descriptions: Array.from({ length: 4 }, (_, i) => `설명${"나".repeat(40)}${i}`),
    keywords: Array.from({ length: 20 }, (_, i) => `${"가".repeat(75)} ${i}`),
  };
  const full = { ...input, searchAd: fullAd };
  assert.ok(Buffer.byteLength(JSON.stringify(full)) > 4096);
  assert.equal((await route.POST(post(full), context())).status, 200);
  assert.deepEqual(JSON.parse(proxyCalls[0].init.body), full);
  proxyCalls.length = 0;
  for (const searchAd of [null, [], { ...fullAd, finalUrl: "https://127.0.0.1" }, { ...fullAd, keywordMatchType: "UNKNOWN" }, { ...fullAd, headlines: [] }]) {
    assert.equal((await route.POST(post({ ...input, searchAd }), context())).status, 400);
  }
  assert.equal(proxyCalls.length, 0);
});

test("BFF byte cap is exactly 16KiB and stops a streaming request when exceeded", async () => {
  const body = JSON.stringify(adInput);
  const padding = 16 * 1024 - Buffer.byteLength(body);
  const request = (text) => new Request("http://localhost/api/campaigns", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: text,
  });
  assert.equal((await route.POST(request(body + " ".repeat(padding)), context())).status, 200);
  assert.equal((await route.POST(request(body + " ".repeat(padding + 1)), context())).status, 413);
  const korean = JSON.stringify({ ...input, name: "가".repeat(5500) });
  assert.ok(korean.length < 16 * 1024);
  assert.ok(Buffer.byteLength(korean) > 16 * 1024);
  assert.equal((await route.POST(request(korean), context())).status, 413);
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024)); },
    cancel() { cancelled = true; },
  });
  const streamed = new Request("http://localhost/api/campaigns", {
    method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: stream, duplex: "half",
  });
  assert.equal((await route.POST(streamed, context())).status, 413);
  assert.equal(cancelled, true);
});

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

const { GoogleAdsSearchAdFields } = await loadTs("../components/campaigns/google-ads-search-ad-fields.tsx", {
  "@/lib/integrations/google-ads-search-ad": adHelpers,
});

test("editor starts with three titles and two descriptions, labelled counters, and bounded add/remove controls", () => {
  let fields = { ...searchAd, bid: "100", headlines: ["", "", ""], descriptions: ["", ""], keywords: "광고 관리\n구글 광고" };
  const render = () => GoogleAdsSearchAdFields({ fields, setFields: (update) => { fields = update(fields); }, errors: {}, disabled: false, currency: "KRW" });
  const find = (label) => elements(render()).find((node) => node.type === "button" && node.props["aria-label"] === label);
  let nodes = elements(render());
  assert.equal(nodes.filter((node) => node.type === "input" && node.props.name?.startsWith("search-ad-headlines-")).length, 3);
  assert.equal(nodes.filter((node) => node.type === "textarea" && node.props.name?.startsWith("search-ad-descriptions-")).length, 2);
  for (const key of ["headlines", "descriptions"]) {
    assert.ok(nodes.find((node) => node.type === "label" && node.props.htmlFor === `search-ad-${key}-0`));
    assert.equal(nodes.find((node) => node.props.id === `search-ad-${key}-0`).props["aria-describedby"], `search-ad-${key}-0-count`);
  }
  for (const [label, key, min, max] of [["광고 제목", "headlines", 3, 15], ["광고 설명", "descriptions", 2, 4]]) {
    assert.equal(find(`${label} 1 삭제`).props.disabled, true);
    for (let count = min; count < max; count++) {
      assert.equal(find(`${label} 추가`).props.disabled, false);
      find(`${label} 추가`).props.onClick();
      assert.equal(fields[key].length, count + 1);
    }
    assert.equal(find(`${label} 추가`).props.disabled, true);
    for (let count = max; count > min; count--) {
      find(`${label} 1 삭제`).props.onClick();
      assert.equal(fields[key].length, count - 1);
    }
    assert.equal(find(`${label} 1 삭제`).props.disabled, true);
  }
  nodes = elements(render());
  nodes.find((node) => node.props.id === "search-ad-headlines-0").props.onChange({ target: { value: "가".repeat(16) } });
  assert.equal(elements(render()).find((node) => node.props.id === "search-ad-headlines-0").props["aria-invalid"], true);
});

test("editor keeps KRW text input stable across input, currency props and unrelated field updates", () => {
  let fields = { ...searchAd, bid: "", keywords: "광고 관리\n구글 광고" };
  let currency = "KRW";
  const render = () => GoogleAdsSearchAdFields({ fields, setFields: (update) => { fields = update(fields); }, errors: {}, disabled: false, currency });
  const bid = () => elements(render()).find((node) => node.props.id === "search-ad-bid");
  assert.equal(bid().props.type, "text");
  assert.equal(bid().props.inputMode, "decimal");
  for (const text of ["1", "10", "100", "100.", "100.0", "100.000001", "0.000001", "1000"]) {
    bid().props.onChange({ target: { value: text } });
    assert.equal(bid().props.value, text);
    elements(render()).find((node) => node.props.id === "search-ad-group").props.onChange({ target: { value: "새 그룹" } });
    assert.equal(bid().props.value, text);
    currency = "USD";
    assert.equal(bid().props.value, text);
    currency = "KRW";
    assert.equal(bid().props.value, text);
  }
  const markup = renderToStaticMarkup(render());
  assert.match(markup, /클릭당 입찰가 \(KRW\)/);
  assert.match(markup, /일치검색 \(EXACT\)/);
  assert.match(markup, /구문검색 \(PHRASE\)/);
});

test("request and stored summaries remain distinct, readonly, escaped and show actual paused keyword statuses", async () => {
  const components = await loadTs("../components/campaigns/google-ads-campaign-details.tsx", {
    "@/lib/integrations/google-ads-campaign": helpers,
  });
  const requested = renderToStaticMarkup(React.createElement(components.SearchAdRequestSummary, { searchAd, currency: "KRW" }));
  const actual = renderToStaticMarkup(React.createElement(components.GoogleAdsStoredDetails, {
    details: details({ headlines: ["<script>alert(1)</script>", ...searchAd.headlines.slice(1)] }), currency: "KRW",
  }));
  assert.match(requested, /요청한 광고 내용/);
  assert.match(actual, /Google 저장 내용/);
  assert.match(actual, /일시중지/);
  assert.match(actual, /EXACT/);
  assert.match(actual, /&lt;script&gt;/);
  assert.doesNotMatch(actual, /<script>|<input|<textarea|<select/);
  const source = await readFile(new URL("../components/campaigns/google-ads-campaign-form.tsx", import.meta.url), "utf8");
  assert.match(source, /광고그룹·광고·키워드는 생성하지 않은 요청/);
  assert.doesNotMatch(source, /없음 · 실행하지 않음 · 없음/);
  assert.match(source, /Google 저장 내용 확인/);
  assert.match(source, /searchAd: validatedAd.searchAd/);
  assert.match(source, /parseDailyBudget\(searchAdFields.bid\)/);
});
