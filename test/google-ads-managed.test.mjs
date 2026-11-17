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
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), loaded, loaded.exports);
  return loaded.exports;
}
const ad = await loadTs("../lib/integrations/google-ads-search-ad.ts");
const campaignHelpers = await loadTs("../lib/integrations/google-ads-campaign.ts", { "./google-ads-search-ad": ad });
const helpers = await loadTs("../lib/integrations/google-ads-managed.ts", { "./google-ads-search-ad": ad, "./google-ads-campaign": campaignHelpers });
const reportHelpers = await loadTs("../lib/integrations/google-ads-report.ts");
const { GoogleAdsSearchAdFields, campaignField } = await loadTs("../components/campaigns/google-ads-search-ad-fields.tsx", { "@/lib/integrations/google-ads-search-ad": ad, "@/lib/integrations/google-ads-managed": helpers });
const detailComponents = await loadTs("../components/campaigns/google-ads-campaign-details.tsx", { "@/lib/integrations/google-ads-campaign": campaignHelpers });
const dependencies = {
  "@/lib/integrations/google-ads-search-ad": ad,
  "@/lib/integrations/google-ads-campaign": campaignHelpers,
  "@/lib/integrations/google-ads-managed": helpers,
  "@/lib/integrations/google-ads-report": reportHelpers,
  "./google-ads-search-ad-fields": { GoogleAdsSearchAdFields, campaignField },
  "./google-ads-campaign-details": detailComponents,
  "./google-ads-ad-group-create-form": { GoogleAdsAdGroupCreateForm: () => null },
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
};
const creationId = "12345678-1234-4234-8234-123456789abc";
const requestId = "22345678-1234-4234-8234-123456789abc";
const searchAd = {
  adGroupName: "실제 광고그룹 테스트", cpcBidMicros: "100000000", finalUrl: "https://example.com/",
  headlines: ["간편한 광고 관리", "광고 현황 확인", "그로우두애즈"], descriptions: ["여러 광고계정 현황을 확인하세요.", "광고 문구를 관리하세요."],
  keywords: ["광고 관리", "구글 광고"], keywordMatchType: "EXACT",
};
const item = { creationRequestId: creationId, accountId: "50", customerId: "6687440172", campaignId: "12345", name: "실제 캠페인 테스트", adGroupId: "456", currency: "KRW" };
const managed = () => ({
  creationRequestId: creationId, accountId: item.accountId, campaignId: item.campaignId, name: item.name, currency: item.currency,
  version: "a".repeat(64), canEdit: true, pendingUpdate: null,
  details: { campaignId: item.campaignId, adGroupId: item.adGroupId, campaignStatus: "PAUSED", adGroupName: searchAd.adGroupName,
    adGroupStatus: "PAUSED", adStatus: "PAUSED", adResourceName: "customers/6687440172/adGroupAds/456~789",
    finalUrls: [searchAd.finalUrl], headlines: searchAd.headlines, descriptions: searchAd.descriptions, cpcBidMicros: searchAd.cpcBidMicros,
    keywords: searchAd.keywords.map((text, index) => ({ text, matchType: "EXACT", status: "PAUSED", resourceName: `customers/6687440172/adGroupCriteria/456~${index + 1}` })), fetchedAt: "2026-11-02T01:00:00Z" },
});
const input = () => ({ requestId, version: "a".repeat(64), searchAd: structuredClone(searchAd), keywordRemovalConsent: false });
const draft = (phase = "submitted") => ({ schema: 1, creationRequestId: creationId, input: input(), phase });
const result = (status = "applied") => ({ requestId, creationRequestId: creationId, status, errorCode: null, createdAt: "2026-11-02T01:00:00Z", updatedAt: "2026-11-02T01:01:00Z" });
const discovery = () => ({
  accountId: item.accountId, customerId: item.customerId, campaignId: item.campaignId, campaignName: item.name, campaignStatus: "PAUSED", currency: item.currency,
  adGroups: [{ id: item.adGroupId, name: searchAd.adGroupName, status: "PAUSED", type: "SEARCH_STANDARD", cpcBidMicros: searchAd.cpcBidMicros,
    keywords: [...managed().details.keywords.map((keyword) => ({ ...keyword, negative: false })),
      { text: "제외 검색어", matchType: "BROAD", status: "PAUSED", resourceName: `customers/${item.customerId}/adGroupCriteria/456~99`, negative: true }],
    ads: [{ id: "789", resourceName: managed().details.adResourceName, type: "RESPONSIVE_SEARCH_AD", status: "PAUSED", finalUrls: [searchAd.finalUrl], headlines: searchAd.headlines, descriptions: searchAd.descriptions, management: { ...item }, unsupportedReason: null },
      { id: "790", resourceName: `customers/${item.customerId}/adGroupAds/456~790`, type: "EXPANDED_TEXT_AD", status: "ENABLED", finalUrls: ["https://example.com/old"], headlines: ["기존 광고"], descriptions: ["원본 설명"], management: null, unsupportedReason: "지원하지 않는 광고 유형입니다." }] },
    { id: "457", name: "두 번째 그룹", status: "ENABLED", type: "SEARCH_STANDARD", cpcBidMicros: null, keywords: [], ads: [] }],
});

test("update validator accepts exactly four fields, UUIDv4, version, boolean consent and the existing search-ad schema", () => {
  assert.deepEqual(helpers.adUpdateInput(input()), input());
  assert.ok(helpers.adUpdateInput({ ...input(), keywordRemovalConsent: true }));
  for (const key of ["campaignId", "adGroupId", "resourceName", "dailyBudgetMicros", "status", "accountId"]) assert.equal(helpers.adUpdateInput({ ...input(), [key]: "1" }), null);
  for (const changes of [{ requestId: "12345678-1234-1234-8234-123456789abc" }, { requestId: `${requestId}\n` }, { version: "a".repeat(63) }, { version: `${"a".repeat(64)}\n` }, { version: "z".repeat(64) }, { keywordRemovalConsent: "false" }, { keywordRemovalConsent: undefined }, { searchAd: { ...searchAd, status: "ENABLED" } }, { searchAd: { ...searchAd, keywords: [] } }]) assert.equal(helpers.adUpdateInput({ ...input(), ...changes }), null);
});

test("managed validators require actual statuses/name, matching resources, strict pending statuses and response identity", () => {
  assert.ok(helpers.isManagedCampaign(item));
  assert.ok(helpers.isManagedDetails(managed()));
  assert.ok(helpers.isManagedDetails({ ...managed(), pendingUpdate: { requestId, status: "unknown", errorCode: null } }));
  for (const changes of [{ version: "bad" }, { campaignId: "999" }, { canEdit: "true" }, { pendingUpdate: { requestId, status: ["unknown"], errorCode: null } }, { details: { ...managed().details, adGroupName: undefined } }, { details: { ...managed().details, campaignStatus: undefined } }]) assert.equal(helpers.isManagedDetails({ ...managed(), ...changes }), false);
  for (const status of ["applying", "applied", "failed", "unknown"]) assert.ok(helpers.isAdUpdateResult(result(status)));
  assert.equal(helpers.isAdUpdateResult(result(["applied"])), false);
  assert.equal(helpers.isAdUpdateResult({ ...result(), updatedAt: "bad" }), false);
});

test("only removed text or changed overall match type requires consent; adding a third keyword removes nothing", () => {
  const fields = helpers.managedSearchAdFields(managed());
  assert.deepEqual(helpers.removedKeywords(managed().details, { ...fields, keywords: `${fields.keywords}\n새 키워드` }), []);
  assert.deepEqual(helpers.removedKeywords(managed().details, { ...fields, adGroupName: "새 이름", headlines: ["다른 제목", ...fields.headlines.slice(1)] }), []);
  assert.deepEqual(helpers.removedKeywords(managed().details, { ...fields, keywords: "구글 광고" }), [managed().details.keywords[0]]);
  assert.deepEqual(helpers.removedKeywords(managed().details, { ...fields, keywordMatchType: "PHRASE" }), managed().details.keywords);
  assert.ok(helpers.managedIsPaused(managed()));
  for (const key of ["campaignStatus", "adGroupStatus", "adStatus"]) assert.equal(helpers.managedIsPaused({ ...managed(), details: { ...managed().details, [key]: "UNKNOWN" } }), false);
  assert.equal(helpers.managedIsPaused({ ...managed(), details: { ...managed().details, keywords: [{ ...managed().details.keywords[0], status: "ENABLED" }] } }), false);
});

test("edit persistence is scoped to user/workspace/creation UUID and keeps exact input and version without auth data", () => {
  const key = helpers.adUpdateStorageKey("u1", "900", creationId);
  for (const args of [["u2", "900", creationId], ["u1", "901", creationId], ["u1", "900", requestId]]) assert.notEqual(key, helpers.adUpdateStorageKey(...args));
  assert.deepEqual(helpers.parseAdUpdateDraft(JSON.stringify(draft()), creationId), draft());
  for (const value of [null, { ...draft(), phase: ["applied"] }, { ...draft(), schema: 2 }, { ...draft(), auth: "secret" }, { ...draft(), creationRequestId: requestId }, { ...draft(), input: { ...input(), accountId: "1" } }]) assert.equal(helpers.parseAdUpdateDraft(JSON.stringify(value), creationId), null);
  assert.equal(helpers.parseAdUpdateDraft("broken", creationId), null);
});

test("POST follows durable persistence; failures recover only the same request and never replay on refresh", async () => {
  const events = [];
  const api = {
    update: async (id, body) => { events.push(["POST", id, body]); throw new TypeError("lost response"); },
    lookup: async (id) => { events.push(["GET", id]); return result(); },
  };
  const outcome = await helpers.submitAdUpdate(draft(), api, (value) => events.push(["save", structuredClone(value)]));
  assert.equal(events[0][0], "save");
  assert.deepEqual(events[1], ["POST", creationId, input()]);
  assert.equal(outcome.draft.phase, "applied");
  events.length = 0;
  await helpers.recoverAdUpdate(outcome.draft, api, () => {});
  assert.deepEqual(events, [["GET", requestId]]);
  let posts = 0;
  await assert.rejects(helpers.submitAdUpdate(draft(), { update: async () => { posts++; } }, () => { throw new Error("storage failed"); }), /storage failed/);
  assert.equal(posts, 0);
});

test("unknown, pending, malformed responses and idempotency conflicts stay locked through missing lookups", async () => {
  for (const code of ["GOOGLE_ADS_AD_UPDATE_UNKNOWN", "GOOGLE_ADS_AD_UPDATE_PENDING", "IDEMPOTENCY_CONFLICT", "CAMPAIGN_RESPONSE_INVALID", undefined]) {
    let posts = 0;
    const api = { update: async () => { posts++; throw new helpers.ManagedApiError(code, 409); }, lookup: async () => { throw new helpers.ManagedApiError(undefined, 404); } };
    const outcome = await helpers.submitAdUpdate(draft(), api, () => {});
    assert.equal(outcome.draft.phase, "unknown");
    assert.equal(helpers.updateIsTerminal(outcome.draft), false);
    const restored = await helpers.recoverAdUpdate(outcome.draft, api, () => {});
    assert.equal(restored.draft.phase, "unknown");
    await assert.rejects(helpers.submitAdUpdate(restored.draft, api, () => {}), /locked/);
    assert.equal(posts, 1);
  }
  const mismatch = await helpers.recoverAdUpdate(draft(), { lookup: async () => ({ ...result(), creationRequestId: requestId }) }, () => {});
  assert.equal(mismatch.draft.phase, "unknown");
});

test("known rejection is terminal while applied only permits another edit after a fresh managed GET in the UI", async () => {
  for (const code of ["GOOGLE_ADS_AD_UPDATE_CONFLICT", "GOOGLE_ADS_PAUSED_REQUIRED", "GOOGLE_ADS_KEYWORD_REMOVAL_CONSENT_REQUIRED", "GOOGLE_ADS_AD_UPDATE_REJECTED"]) {
    const outcome = await helpers.submitAdUpdate(draft(), { update: async () => { throw new helpers.ManagedApiError(code, 409); } }, () => {});
    assert.equal(outcome.draft.phase, "failed");
    assert.ok(outcome.error);
  }
  for (const code of ["TEST_CAMPAIGNS_DISABLED", "GOOGLE_ADS_TEST_ACCOUNT_REQUIRED", "GOOGLE_ADS_AD_UPDATE_CONFLICT"]) assert.doesNotMatch(helpers.managedErrorMessage(code), /테스트/);
});

test("same-origin managed API uses contract paths, no-store and strict identity checks", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json(url.endsWith("/managed") ? { items: [item] } : url.endsWith(`/managed/${creationId}`) ? managed() : result()); };
  const api = helpers.managedCampaignApi("900");
  assert.equal(calls.length, 0);
  assert.deepEqual(await api.list(), [item]);
  await api.details(creationId); await api.update(creationId, input()); await api.lookup(requestId);
  assert.deepEqual(calls.map((call) => call.url.split("/campaigns/")[1]), ["managed", `managed/${creationId}`, `managed/${creationId}/updates`, `updates/${requestId}`]);
  for (const { init } of calls) { assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store"); }
  assert.deepEqual(JSON.parse(calls[2].init.body), input());
  globalThis.fetch = async () => Response.json({ ...result(), requestId: creationId });
  await assert.rejects(api.lookup(requestId), (error) => error.code === "CAMPAIGN_RESPONSE_INVALID");
  globalThis.fetch = async () => Response.json({ code: "GOOGLE_ADS_TEST_ACCOUNT_REQUIRED" }, { status: 403 });
  await assert.rejects(api.details(creationId), (error) => error.status === 403 && !error.message.includes("테스트"));
});

const proxyCalls = [];
const route = await loadTs("../app/api/workspaces/[workspaceId]/integrations/google-ads/[...path]/route.ts", {
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  "@/lib/integrations/google-ads-report": reportHelpers,
  "@/lib/integrations/google-ads-campaign": campaignHelpers,
  "@/lib/integrations/google-ads-managed": helpers,
  "@/lib/auth/proxy": { proxyAuthenticatedJson: async (path, init) => { proxyCalls.push({ path, init }); return Response.json({ ok: true }, { headers: { "Set-Cookie": "refreshed=yes; HttpOnly" } }); } },
});
const context = (path, workspaceId = "900") => ({ params: Promise.resolve({ workspaceId, path: ["campaigns", ...path] }) });
const writePath = ["managed", creationId, "updates"];
const post = (body = input(), headers = {}, suffix = "") => new Request(`http://localhost/api/campaigns${suffix}`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("BFF allows only managed GET list/details, update POST and update-status GET; rejects extra queries/methods/paths", async () => {
  proxyCalls.length = 0;
  for (const path of [["managed"], ["managed", creationId], ["updates", requestId]]) {
    const response = await route.GET(new Request("http://localhost/api/campaigns"), context(path));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Set-Cookie"), /refreshed/);
    assert.equal(proxyCalls.at(-1).path, `/workspaces/900/integrations/google-ads/campaigns/${path.join("/")}`);
    assert.equal(proxyCalls.at(-1).init.body, undefined);
    assert.equal((await route.POST(post(), context(path))).status, 404);
    assert.equal((await route.GET(new Request("http://localhost/api/campaigns?accountId=50"), context(path))).status, 400);
  }
  assert.equal((await route.POST(post(), context(writePath))).status, 200);
  assert.deepEqual(JSON.parse(proxyCalls.at(-1).init.body), input());
  const before = proxyCalls.length;
  for (const path of [["managed", "bad"], ["managed", creationId, "updates", "extra"], ["updates", "bad"], ["managed", `${creationId}\n`], ["managed", `../${creationId}`]]) assert.equal((await route.GET(new Request("http://localhost/api/campaigns"), context(path))).status, 404);
  assert.equal((await route.GET(new Request("http://localhost/api/campaigns"), context(writePath))).status, 404);
  assert.equal((await route.POST(post(), context(writePath, "900\n"))).status, 404);
  assert.equal((await route.POST(post(), context(writePath, "../900"))).status, 404);
  assert.equal(proxyCalls.length, before);
});

test("update BFF enforces origin, JSON, exact body schema, UTF-8 and streaming 16KiB byte cap before auth proxy", async () => {
  proxyCalls.length = 0;
  for (const headers of [{ origin: "" }, { origin: "null" }, { origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }]) assert.equal((await route.POST(post(input(), headers), context(writePath))).status, 403);
  assert.equal((await route.POST(post(input(), { "content-type": "text/plain" }), context(writePath))).status, 415);
  assert.equal((await route.POST(post(input(), {}, "?x=1"), context(writePath))).status, 400);
  for (const body of [{ ...input(), status: "ENABLED" }, { ...input(), resourceName: "arbitrary" }, { ...input(), keywordRemovalConsent: null }, { ...input(), searchAd: { ...searchAd, headlines: ["bad\ncontrol", "a", "b"] } }]) assert.equal((await route.POST(post(body), context(writePath))).status, 400);
  assert.equal(proxyCalls.length, 0);
  const body = JSON.stringify(input());
  const request = (body) => new Request("http://localhost/api/campaigns", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body });
  assert.equal((await route.POST(request(body + " ".repeat(16384 - Buffer.byteLength(body))), context(writePath))).status, 200);
  assert.equal((await route.POST(request(body + " ".repeat(16385 - Buffer.byteLength(body))), context(writePath))).status, 413);
  assert.equal((await route.POST(request(new Uint8Array([0xff, 0xfe])), context(writePath))).status, 400);
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
  const streamed = new Request("http://localhost/api/campaigns", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: stream, duplex: "half" });
  assert.equal((await route.POST(streamed, context(writePath))).status, 413);
  assert.ok(cancelled);
});

test("shared fields SSR uses white enabled inputs and real :disabled gray styles including inherited disabled fieldsets", () => {
  const fields = helpers.managedSearchAdFields(managed());
  for (const disabled of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(GoogleAdsSearchAdFields, { fields, setFields: () => {}, errors: {}, disabled, currency: "KRW" }));
    assert.equal(/<fieldset disabled=""/.test(html), disabled);
    for (const token of ["bg-white", "disabled:bg-[#e9ecef]", "disabled:text-[#8a929e]", "disabled:cursor-not-allowed", "disabled:opacity-100"]) assert.ok(html.includes(token));
    assert.doesNotMatch(html, /disabled:opacity-60|bg-\[#fffdf9\]/);
    assert.match(html, /실제 광고그룹 테스트/);
  }
});

test("management page authorizes roles on server and passes deep links without rendering a manager for viewers", async () => {
  let role = "viewer";
  const Page = (await loadTs("../app/workspaces/[workspaceId]/campaigns/page.tsx", {
    "next/link": dependencies["next/link"], "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/components/campaigns/google-ads-campaign-manager": { GoogleAdsCampaignManager: (props) => React.createElement("section", { "data-manager": true, "data-creation": props.initialCreationRequestId }) },
    "@/lib/integrations/google-ads-campaign": campaignHelpers,
    "@/lib/integrations/google-ads-campaign-server": { getCurrentUser: async () => ({ id: "u1" }) },
    "@/lib/workspaces/server": { getWorkspaces: async () => [{ ...fixtureWorkspaces[0], id: "900", role }] },
  })).default;
  const props = { params: Promise.resolve({ workspaceId: "900" }), searchParams: Promise.resolve({ creationRequestId: creationId }) };
  const viewer = renderToStaticMarkup(await Page(props));
  assert.match(viewer, /광고 관리 권한이 없습니다/);
  assert.doesNotMatch(viewer, /data-manager/);
  for (role of ["owner", "admin", "marketer"]) assert.match(renderToStaticMarkup(await Page(props)), new RegExp(`data-creation="${creationId}"`));
});

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
function hookHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (action) => { slots[i].value = typeof action === "function" ? action(slots[i].value) : action; }]; },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  return { hooks, render(Component, props) { cursor = 0; const tree = Component(props); const pending = effects; effects = []; pending.forEach((effect) => effect()); return tree; }, cleanup() { slots.forEach((slot) => slot?.cleanup?.()); }, remountEffects() { slots.forEach((slot) => { if (slot?.cleanup) { slot.cleanup(); slot.deps = undefined; } }); } };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };

async function editorFixture(t, options = {}) {
  const originals = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window };
  const storage = new Map();
  const calls = [];
  const campaign = options.campaign ?? item;
  let latest = { ...managed(), creationRequestId: campaign.creationRequestId };
  if (options.details) latest = { ...latest, ...options.details };
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { if (options.storageFails) throw new Error("unavailable"); storage.set(key, value); } };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      const saved = helpers.parseAdUpdateDraft(storage.get(helpers.adUpdateStorageKey("u1", "900", campaign.creationRequestId)), campaign.creationRequestId);
      assert.deepEqual(saved.input, body);
      assert.equal(saved.phase, "submitted");
      if (options.unknown) return Response.json({ ...result("unknown"), creationRequestId: campaign.creationRequestId, requestId: body.requestId });
      latest = { ...latest, version: "b".repeat(64), details: { ...latest.details, adGroupName: body.searchAd.adGroupName, headlines: body.searchAd.headlines, keywords: body.searchAd.keywords.map((text, index) => ({ ...latest.details.keywords[0], text, resourceName: `customers/6687440172/adGroupCriteria/456~${index + 1}` })) } };
      return Response.json({ ...result(), creationRequestId: campaign.creationRequestId, requestId: body.requestId });
    }
    if (url.includes("/updates/")) return Response.json({ ...result(options.unknown ? "unknown" : "applied"), requestId: url.split("/").at(-1) });
    if (options.failFresh && calls.some((call) => call.init.method === "POST")) return Response.json({}, { status: 503 });
    return Response.json(latest);
  };
  const harness = hookHarness();
  const components = await loadTs("../components/campaigns/google-ads-campaign-manager.tsx", { ...dependencies, react: { ...React, ...harness.hooks } });
  const props = { workspace: { ...fixtureWorkspaces[0], id: "900", role: "owner" }, userId: "u1", campaign, eligible: options.eligible !== false, adResourceName: options.adResourceName };
  let tree;
  const render = () => { tree = harness.render(components.ManagedCampaignEditor, props); return tree; };
  const find = (predicate) => nodes(tree).find(predicate);
  const byText = (text) => find((node) => node.type === "button" && nodes(node).length && node.props.children?.includes?.(text));
  render();
  await flush(); render();
  t.after(() => { harness.cleanup(); Object.assign(globalThis, originals); });
  return { render, find, byText, calls, storage, harness };
}

test("UI defaults to actual read-only details, edits group/title/adds third keyword with false consent, then fresh GET", async (t) => {
  const ui = await editorFixture(t);
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.byText("수정").props.disabled, false);
  assert.equal(ui.find((node) => node.type === "form"), undefined);
  ui.byText("수정").props.onClick(); ui.render();
  let fields = ui.find((node) => node.type === GoogleAdsSearchAdFields);
  assert.equal(fields.props.disabled, false);
  fields.props.setFields((value) => ({ ...value, adGroupName: "새 광고그룹", headlines: ["새 광고 제목", ...value.headlines.slice(1)], keywords: `${value.keywords}\n세 번째 키워드` }));
  ui.render();
  assert.equal(ui.find((node) => node.props.name === "keywordRemovalConsent"), undefined);
  ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await flush(); ui.render();
  const post = ui.calls.find((call) => call.init.method === "POST");
  assert.deepEqual(Object.keys(JSON.parse(post.init.body)), ["requestId", "version", "searchAd", "keywordRemovalConsent"]);
  assert.equal(JSON.parse(post.init.body).version, "a".repeat(64));
  assert.equal(JSON.parse(post.init.body).keywordRemovalConsent, false);
  assert.equal(JSON.parse(post.init.body).searchAd.keywords.length, 3);
  assert.ok(ui.calls.at(-1).url.endsWith(`/managed/${creationId}`));
  assert.equal(ui.byText("수정").props.disabled, false);
  ui.byText("수정").props.onClick(); ui.render();
  fields = ui.find((node) => node.type === GoogleAdsSearchAdFields);
  assert.equal(fields.props.fields.adGroupName, "새 광고그룹");
  ui.byText("취소").props.onClick(); ui.render();
  assert.equal(ui.find((node) => node.type === "form"), undefined);
});

test("UI shows exact removed keyword list and explicit checkbox only for removal; cancel never POSTs", async (t) => {
  const ui = await editorFixture(t);
  ui.byText("수정").props.onClick(); ui.render();
  ui.find((node) => node.type === GoogleAdsSearchAdFields).props.setFields((value) => ({ ...value, keywords: "구글 광고" })); ui.render();
  const removal = ui.find((node) => node.props["aria-labelledby"] === "removed-keywords-title");
  assert.ok(removal);
  const html = renderToStaticMarkup(removal);
  assert.match(html, /광고 관리 · EXACT/);
  assert.doesNotMatch(html, /구글 광고 · EXACT/);
  assert.equal(ui.byText("저장").props.disabled, true);
  ui.find((node) => node.props.name === "keywordRemovalConsent").props.onChange({ target: { checked: true } }); ui.render();
  assert.equal(ui.byText("저장").props.disabled, false);
  ui.find((node) => node.type === GoogleAdsSearchAdFields).props.setFields((value) => ({ ...value, adGroupName: "수정" })); ui.render();
  assert.equal(ui.find((node) => node.props.name === "keywordRemovalConsent").props.checked, false);
  ui.byText("취소").props.onClick(); ui.render();
  assert.equal(ui.calls.filter((call) => call.init.method === "POST").length, 0);
});

test("UI blocks new edit while uncertain, performs GET-only recovery on refresh, and requires successful fresh GET after applied", async (t) => {
  const ui = await editorFixture(t, { unknown: true });
  ui.byText("수정").props.onClick(); ui.render();
  ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await flush(); ui.render();
  assert.equal(ui.byText("수정").props.disabled, true);
  const body = JSON.parse(ui.calls.find((call) => call.init.method === "POST").init.body);
  ui.byText("다시 조회").props.onClick(); await flush(); ui.render();
  assert.equal(ui.calls.filter((call) => call.init.method === "POST").length, 1);
  assert.ok(ui.calls.some((call) => call.url.endsWith(`/updates/${body.requestId}`)));
  assert.equal(ui.byText("수정").props.disabled, true);
});

test("UI remains locked when the post-applied Google read fails", async (t) => {
  const ui = await editorFixture(t, { failFresh: true });
  ui.byText("수정").props.onClick(); ui.render();
  ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await flush(); ui.render();
  assert.equal(ui.byText("수정").props.disabled, true);
});

test("readonly state rejects enabled/unknown statuses and ineligible accounts; Strict Mode effect replay still loads", async (t) => {
  const ui = await editorFixture(t, { details: { details: { ...managed().details, campaignStatus: "UNKNOWN" } } });
  assert.equal(ui.byText("수정").props.disabled, true);
  ui.harness.remountEffects(); ui.render(); await flush(); ui.render();
  assert.equal(ui.byText("다시 조회").props.disabled, false);
});

test("manager SSR has disabled campaign and ad fields without an account and preserves real resource names", async () => {
  const { GoogleAdsCampaignManager } = await loadTs("../components/campaigns/google-ads-campaign-manager.tsx", dependencies);
  const html = renderToStaticMarkup(React.createElement(GoogleAdsCampaignManager, { workspace: fixtureWorkspaces[0], userId: "u1" }));
  assert.match(html, /연결된 계정/);
  assert.match(html, /name="connectedAccount"/);
  assert.match(html, /id="managed-campaign"[^>]*disabled=""/);
  assert.match(html, /<fieldset disabled=""/);
  assert.doesNotMatch(html, /테스트 계정/);
  const details = renderToStaticMarkup(React.createElement(detailComponents.GoogleAdsStoredDetails, { details: managed().details, currency: "KRW" }));
  assert.doesNotMatch(details, /<input|<textarea|<select/);
  assert.match(item.name, /테스트/);
});

test("all Google campaigns discover live ads; only UUID deep links preselect an ad", async (t) => {
  const originals = { fetch: globalThis.fetch };
  t.after(() => Object.assign(globalThis, originals));
  const report = buildFixtureReport();
  report.accounts[0].customerId = item.customerId;
  report.accounts[0].campaigns.push({ ...report.accounts[0].campaigns[0], id: item.campaignId, name: "Google에서 바꾼 현재 이름" });
  globalThis.fetch = async (url) => Response.json(url.includes("/report?") ? report : { items: [item] });
  for (const initial of [{ initialAccountId: "50", initialCampaignId: item.campaignId }, { initialCreationRequestId: creationId }, { initialAccountId: "50", initialCampaignId: "1000" }]) {
    const harness = hookHarness();
    const { GoogleAdsCampaignManager, CampaignAdDiscovery, ManagedCampaignEditor } = await loadTs("../components/campaigns/google-ads-campaign-manager.tsx", { ...dependencies, react: { ...React, ...harness.hooks } });
    const props = { workspace: { ...fixtureWorkspaces[0], id: report.workspaceId }, userId: "u1", ...initial };
    harness.render(GoogleAdsCampaignManager, props); await flush();
    const tree = harness.render(GoogleAdsCampaignManager, props);
    const editor = nodes(tree).find((node) => node.type === ManagedCampaignEditor);
    const discovered = nodes(tree).find((node) => node.type === CampaignAdDiscovery);
    const selector = nodes(tree).find((node) => node.props.id === "managed-campaign");
    assert.equal(nodes(selector).filter((node) => node.type === "option").length, report.accounts[0].campaigns.length + 1);
    assert.match(renderToStaticMarkup(selector), /Google에서 바꾼 현재 이름/);
    assert.equal(editor, undefined);
    assert.equal(discovered.props.campaignId, initial.initialCampaignId ?? item.campaignId);
    assert.equal(discovered.props.initialCreationRequestId, initial.initialCreationRequestId ?? "");
    const accountSelector = nodes(tree).find((node) => node.props.id === "managed-account");
    accountSelector.props.onChange({ target: { value: "51" } });
    const changed = harness.render(GoogleAdsCampaignManager, props);
    assert.equal(nodes(changed).find((node) => node.type === CampaignAdDiscovery), undefined);
    assert.equal(nodes(changed).find((node) => node.props.id === "managed-campaign").props.value, "");
    harness.cleanup();
  }
});

test("campaign options use fresh account data and never bind another account or customer", () => {
  const report = buildFixtureReport();
  const account = report.accounts[0];
  const campaign = account.campaigns[0];
  const bound = { ...item, accountId: account.accountId, customerId: account.customerId, campaignId: campaign.id };
  assert.equal(helpers.managedCampaignOptions(report.accounts, [bound], account.accountId).length, account.campaigns.length);
  assert.deepEqual(helpers.managedCampaignOptions(report.accounts, [bound], account.accountId)[0].managed, bound);
  for (const change of [{ accountId: "999" }, { customerId: "0000000000" }, { campaignId: "999999" }]) {
    assert.equal(helpers.managedCampaignOptions(report.accounts, [{ ...bound, ...change }], account.accountId)[0].managed, null);
  }
  assert.deepEqual(helpers.managedCampaignOptions([{ ...account, status: "error" }], [bound], account.accountId), []);
  assert.deepEqual(helpers.initialCampaignSelection(report.accounts, [], account.accountId, campaign.id, ""), { accountId: account.accountId, campaignId: campaign.id });
  assert.deepEqual(helpers.initialCampaignSelection(report.accounts, [], "missing", campaign.id, ""), { accountId: "", campaignId: "" });
});

test("failed account lookup is not presented as an empty campaign list", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const report = buildFixtureReport({ scenario: "partial" });
  const account = report.accounts.find((item) => item.status === "error");
  globalThis.fetch = async (url) => Response.json(url.includes("/report?") ? report : { items: [] });
  const harness = hookHarness();
  const { GoogleAdsCampaignManager } = await loadTs("../components/campaigns/google-ads-campaign-manager.tsx", { ...dependencies, react: { ...React, ...harness.hooks } });
  const props = { workspace: fixtureWorkspaces[0], userId: "u1", initialAccountId: account.accountId };
  harness.render(GoogleAdsCampaignManager, props); await flush();
  const html = renderToStaticMarkup(harness.render(GoogleAdsCampaignManager, props));
  assert.match(html, /이 계정의 캠페인을 불러오지 못했습니다/);
  assert.doesNotMatch(html, /이 계정에는 조회된 캠페인이 없습니다/);
  harness.cleanup();
});

test("discovery validates empty/multiple groups and ads, complete hierarchy, IDs, bindings and keyword polarity", () => {
  assert.ok(helpers.isCampaignAds(discovery(), item, item.campaignId));
  assert.ok(helpers.isCampaignAds({ ...discovery(), adGroups: [] }, item, item.campaignId));
  const invalid = [
    (v) => { v.accountId = "51"; }, (v) => { v.customerId = "1111111111"; }, (v) => { v.campaignId = "999"; },
    (v) => { v.currency = "USD"; }, (v) => { v.campaignStatus = "ACTIVE"; }, (v) => { v.adGroups = null; },
    (v) => { v.adGroups.push(v.adGroups[0]); }, (v) => { v.adGroups[0].id = "0"; },
    (v) => { v.adGroups[0].cpcBidMicros = 123; }, (v) => { v.adGroups[0].cpcBidMicros = "1e6"; },
    (v) => { v.adGroups[0].keywords[0].negative = "false"; }, (v) => { delete v.adGroups[0].keywords[0].negative; },
    (v) => { v.adGroups[0].keywords[0].resourceName = "customers/1111111111/adGroupCriteria/456~1"; },
    (v) => { v.adGroups[0].keywords[0].resourceName = `customers/${item.customerId}/adGroupCriteria/457~1`; },
    (v) => { v.adGroups[0].keywords.push(v.adGroups[0].keywords[0]); },
    (v) => { v.adGroups[0].ads.push(v.adGroups[0].ads[0]); }, (v) => { v.adGroups[0].ads[0].id = "789\n"; },
    (v) => { v.adGroups[0].ads[0].resourceName = `customers/${item.customerId}/adGroupAds/456~790`; },
    (v) => { v.adGroups[0].ads[0].resourceName = "customers/1111111111/adGroupAds/456~789"; },
    (v) => { v.adGroups[0].ads[0].headlines = [1]; }, (v) => { delete v.adGroups[0].ads[0].unsupportedReason; },
    ...["accountId", "customerId", "campaignId", "adGroupId", "currency"].map((key) => (v) => { v.adGroups[0].ads[0].management[key] = "999"; }),
    (v) => { v.adGroups[0].ads[0].management.creationRequestId = "bad"; },
    (v) => { v.adGroups[0].ads[1].management = { ...item, creationRequestId: creationId.toUpperCase() }; },
  ];
  for (const mutate of invalid) {
    const value = discovery(); mutate(value);
    assert.equal(helpers.isCampaignAds(value, item, item.campaignId), false, mutate.toString());
  }
  assert.deepEqual(helpers.initialAdSelection(discovery(), creationId.toUpperCase()), { adGroupId: "456", adId: "789" });
  assert.deepEqual(helpers.initialAdSelection(discovery(), ""), { adGroupId: "", adId: "" });
});

test("discovery API is a same-origin GET with abort signal, response identity validation and honest errors", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  const controller = new AbortController();
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json(discovery()); };
  const api = helpers.managedCampaignApi("900");
  assert.deepEqual(await api.discover(item, item.campaignId, controller.signal), discovery());
  assert.equal(calls[0].url, "/api/workspaces/900/integrations/google-ads/campaigns/accounts/50/12345/ads");
  assert.equal(calls[0].init.signal, controller.signal);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.credentials, "same-origin");
  for (const campaignId of ["0", "-1", "01", "1\n", "../1", 1]) await assert.rejects(api.discover(item, campaignId), (e) => e.code === "CAMPAIGN_RESPONSE_INVALID");
  assert.equal(calls.length, 1);
  for (const value of [null, {}, { ...discovery(), campaignId: "999" }]) {
    globalThis.fetch = async () => Response.json(value);
    await assert.rejects(api.discover(item, item.campaignId), (e) => e.code === "CAMPAIGN_RESPONSE_INVALID");
  }
  for (const status of [401, 403, 404, 503]) {
    globalThis.fetch = async () => Response.json({ message: "unavailable" }, { status });
    await assert.rejects(api.discover(item, item.campaignId), (e) => e.status === status);
  }
});

test("discovery BFF allows only the exact positive-ID GET, forbids queries and POST, and retains auth failures", async () => {
  const path = ["accounts", "50", "12345", "ads"];
  proxyCalls.length = 0;
  const response = await route.GET(new Request("http://localhost/api/campaigns"), context(path));
  assert.equal(response.status, 200);
  assert.equal(proxyCalls[0].path, "/workspaces/900/integrations/google-ads/campaigns/accounts/50/12345/ads");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.match(response.headers.get("Set-Cookie"), /refreshed/);
  const bad = [
    ["accounts", "0", "12345", "ads"], ["accounts", "50", "0", "ads"], ["accounts", "01", "12345", "ads"],
    ["accounts", "50", "-1", "ads"], ["accounts", "50", "12345\n", "ads"], ["accounts", "../50", "12345", "ads"],
    ["accounts", "50", "12345", "ads", "extra"], ["accounts", "50", "ads"], ["accounts", "50", "12345", "ad"],
  ];
  for (const value of bad) assert.equal((await route.GET(new Request("http://localhost/api/campaigns"), context(value))).status, 404);
  assert.equal((await route.POST(post(), context(path))).status, 404);
  assert.equal((await route.GET(new Request("http://localhost/api/campaigns?x=1"), context(path))).status, 400);
  assert.equal((await route.GET(new Request("http://localhost/api/campaigns"), context(path, "0"))).status, 404);
  assert.equal(proxyCalls.length, 1);
  for (const status of [401, 403]) {
    const protectedRoute = await loadTs("../app/api/workspaces/[workspaceId]/integrations/google-ads/[...path]/route.ts", {
      "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
      "@/lib/integrations/google-ads-campaign": campaignHelpers,
      "@/lib/integrations/google-ads-report": reportHelpers,
      "@/lib/auth/proxy": { proxyAuthenticatedJson: async () => Response.json({ message: "denied" }, { status }) },
    });
    assert.equal((await protectedRoute.GET(new Request("http://localhost/api/campaigns"), context(path))).status, status);
  }
});

async function discoveryFixture(t, options = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return options.fetch ? options.fetch(url, init) : Response.json(options.value ?? discovery());
  };
  const harness = hookHarness();
  const components = await loadTs("../components/campaigns/google-ads-campaign-manager.tsx", { ...dependencies, react: { ...React, ...harness.hooks } });
  const props = { workspace: { ...fixtureWorkspaces[0], id: "900", role: "owner" }, userId: "u1", account: { ...buildFixtureReport().accounts[0], ...item }, campaignId: item.campaignId, initialCreationRequestId: "", eligible: true, ...options.props };
  let tree;
  const render = () => { tree = harness.render(components.CampaignAdDiscovery, props); return tree; };
  const find = (predicate) => nodes(tree).find(predicate);
  const select = (id, value) => { find((node) => node.props.id === id).props.onChange({ target: { value } }); render(); };
  render(); await flush(); render();
  t.after(() => { harness.cleanup(); globalThis.fetch = original; });
  return { props, render, find, select, calls, harness, components };
}

test("discovery renders multiple groups/ads, real positive and negative keywords, and unsupported ads without editor", async (t) => {
  const ui = await discoveryFixture(t);
  assert.equal(ui.find((node) => node.props.id === "discovered-ad-group").props.value, "");
  assert.equal(ui.find((node) => node.props.id === "discovered-ad").props.disabled, true);
  ui.select("discovered-ad-group", "456");
  const adSelect = ui.find((node) => node.props.id === "discovered-ad");
  assert.equal(nodes(adSelect).filter((node) => node.type === "option").length, 3);
  const keywords = renderToStaticMarkup(ui.find((node) => node.props["aria-label"] === "광고그룹 저장 내용"));
  assert.match(keywords, /키워드: 광고 관리/);
  assert.match(keywords, /제외 키워드: 제외 검색어/);
  assert.match(keywords, /BROAD/);
  ui.select("discovered-ad", "790");
  const html = renderToStaticMarkup(ui.render());
  assert.match(html, /지원하지 않는 광고 유형/);
  assert.match(html, /기존 광고/); assert.match(html, /원본 설명/); assert.match(html, /example.com\/old/);
  assert.equal(ui.find((node) => node.type === ui.components.ManagedCampaignEditor), undefined);
  ui.select("discovered-ad", "789");
  assert.equal(ui.find((node) => node.type === ui.components.ManagedCampaignEditor).props.adResourceName, managed().details.adResourceName);
  ui.select("discovered-ad-group", "457");
  assert.equal(ui.find((node) => node.props.id === "discovered-ad").props.value, "");
  assert.equal(ui.find((node) => node.type === ui.components.ManagedCampaignEditor), undefined);
  const empty = renderToStaticMarkup(ui.render());
  assert.match(empty, /이 광고그룹에는 광고가 없습니다/); assert.match(empty, /이 광고그룹에는 키워드가 없습니다/); assert.match(empty, /미설정/);
});

test("fresh saved details synchronize group selectors, positive keywords and ad labels without losing negatives or selection", async (t) => {
  const ui = await discoveryFixture(t, { props: { initialCreationRequestId: creationId } });
  const editor = ui.find((node) => node.type === ui.components.ManagedCampaignEditor);
  const latest = structuredClone(managed());
  latest.details.adGroupName = "수정된 그룹";
  latest.details.headlines[0] = "수정된 광고 제목";
  latest.details.keywords = [{ ...latest.details.keywords[0], text: "새 키워드" }];
  editor.props.onDetails(latest); ui.render();
  assert.equal(ui.find((node) => node.props.id === "discovered-ad-group").props.value, "456");
  assert.equal(ui.find((node) => node.props.id === "discovered-ad").props.value, "789");
  assert.match(renderToStaticMarkup(ui.find((node) => node.props.id === "discovered-ad-group")), /수정된 그룹/);
  assert.match(renderToStaticMarkup(ui.find((node) => node.props.id === "discovered-ad")), /수정된 광고 제목/);
  const keywords = renderToStaticMarkup(ui.find((node) => node.props["aria-label"] === "광고그룹 저장 내용"));
  assert.match(keywords, /새 키워드/); assert.match(keywords, /제외 검색어/);
  assert.doesNotMatch(keywords, /구글 광고/);
  const before = keywords;
  editor.props.onDetails({ ...latest, campaignId: "999" }); ui.render();
  assert.equal(renderToStaticMarkup(ui.find((node) => node.props["aria-label"] === "광고그룹 저장 내용")), before);
});

test("discovery distinguishes empty campaign from failure", async (t) => {
  const ui = await discoveryFixture(t, { value: { ...discovery(), adGroups: [] } });
  assert.match(renderToStaticMarkup(ui.render()), /이 캠페인에는 광고그룹이 없습니다/);
});

test("discovery errors leave selectors disabled without presenting an empty campaign", async (t) => {
  const ui = await discoveryFixture(t, { fetch: async () => Response.json({}, { status: 503 }) });
  const html = renderToStaticMarkup(ui.render());
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /이 캠페인에는 광고그룹이 없습니다/);
  assert.equal(ui.find((node) => node.props.id === "discovered-ad-group").props.disabled, true);
});

test("discovery UUID deep links select the actual group/ad, including a dedicated imported binding", async (t) => {
  const externalId = "32345678-1234-5234-8234-123456789abc";
  const value = discovery();
  value.adGroups[1] = { ...value.adGroups[0], id: "457", keywords: [], ads: [{ ...value.adGroups[0].ads[0], id: "999", resourceName: `customers/${item.customerId}/adGroupAds/457~999`, management: { ...item, creationRequestId: externalId, adGroupId: "457" } }] };
  const ui = await discoveryFixture(t, { value, props: { initialCreationRequestId: externalId } });
  assert.equal(ui.find((node) => node.props.id === "discovered-ad-group").props.value, "457");
  assert.equal(ui.find((node) => node.props.id === "discovered-ad").props.value, "999");
  assert.equal(ui.find((node) => node.type === ui.components.ManagedCampaignEditor).props.campaign.creationRequestId, externalId);
});

test("rapid campaign/account changes abort old discovery and ignore late responses, including Strict Mode replay", async (t) => {
  const pending = [];
  const ui = await discoveryFixture(t, { fetch: (url, init) => new Promise((resolve) => pending.push({ url, init, resolve })) });
  ui.props.campaignId = "22222"; ui.render(); await flush(); ui.render();
  assert.equal(pending[0].init.signal.aborted, true);
  const latest = discovery(); latest.campaignId = "22222"; latest.campaignName = "최신 캠페인"; latest.adGroups[0].ads[0].management.campaignId = "22222";
  pending[1].resolve(Response.json(latest)); await flush(); ui.render();
  pending[0].resolve(Response.json(discovery())); await flush();
  assert.match(renderToStaticMarkup(ui.render()), /최신 캠페인/);
  assert.doesNotMatch(renderToStaticMarkup(ui.render()), /실제 캠페인 테스트/);
  ui.select("discovered-ad-group", "456"); ui.select("discovered-ad", "789");
  ui.props.account = { ...ui.props.account, accountId: "51" };
  ui.render();
  assert.equal(ui.find((node) => node.type === ui.components.ManagedCampaignEditor), undefined);
  await flush(); ui.render();
  assert.equal(ui.find((node) => node.props.id === "discovered-ad-group").props.value, "");
  ui.harness.remountEffects(); ui.render(); await flush();
  assert.equal(pending[2].init.signal.aborted, true);
  pending[3].resolve(Response.json({ ...discovery(), accountId: "51", campaignId: "22222", adGroups: [] })); await flush();
  assert.match(renderToStaticMarkup(ui.render()), /이 캠페인에는 광고그룹이 없습니다/);
});

test("uniform BROAD survives read, form and update schema; mixed keywords and multiple URLs cannot be flattened", () => {
  const value = managed(); value.details.keywords.forEach((keyword) => { keyword.matchType = "BROAD"; });
  const fields = helpers.managedSearchAdFields(value);
  assert.equal(fields.keywordMatchType, "BROAD");
  assert.equal(ad.validateSearchAdFields(fields, value.details.cpcBidMicros).searchAd.keywordMatchType, "BROAD");
  assert.ok(helpers.adUpdateInput({ ...input(), searchAd: { ...searchAd, keywordMatchType: "BROAD" } }));
  const html = renderToStaticMarkup(React.createElement(GoogleAdsSearchAdFields, { fields, setFields() {}, errors: {}, disabled: false }));
  assert.match(html, /value="BROAD" selected=""/);
  value.details.keywords[0].matchType = "EXACT";
  assert.equal(helpers.managedSearchAdFields(value), null);
  assert.ok(helpers.managedReadonlyReason(value));
  assert.equal(helpers.managedSearchAdFields({ ...managed(), details: { ...managed().details, finalUrls: [searchAd.finalUrl, "https://example.com/other"] } }), null);
});

test("sibling pending safety shows backend readonlyReason even with pendingUpdate:null and no status conversion", async (t) => {
  const reason = "같은 광고그룹의 다른 광고 수정 요청이 처리 중입니다.";
  const ui = await editorFixture(t, { details: { canEdit: false, pendingUpdate: null, details: { ...managed().details, readonlyReason: reason } } });
  assert.equal(ui.byText("수정").props.disabled, true);
  assert.equal(ui.byText("수정").props.title, reason);
  assert.match(renderToStaticMarkup(ui.render()), new RegExp(reason));
  assert.equal(ui.find((node) => node.type === "form"), undefined);
  assert.equal(ui.calls.filter((call) => call.init.method === "POST").length, 0);
});

test("zero positive keywords stay editable but save requires adding a keyword, with shared-group consequence copy", async (t) => {
  const ui = await editorFixture(t, { details: { details: { ...managed().details, keywords: [] } } });
  assert.equal(ui.byText("수정").props.disabled, false);
  ui.byText("수정").props.onClick(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.fields.keywords, "");
  assert.match(renderToStaticMarkup(ui.find((node) => node.type === "form")), /같은 광고그룹의 다른 광고에도 적용/);
  ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await flush(); ui.render();
  assert.ok(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.errors.keywords);
  assert.equal(ui.calls.filter((call) => call.init.method === "POST").length, 0);
  ui.find((node) => node.type === GoogleAdsSearchAdFields).props.setFields((fields) => ({ ...fields, keywords: "새 키워드" })); ui.render();
  ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await flush(); ui.render();
  assert.deepEqual(JSON.parse(ui.calls.find((call) => call.init.method === "POST").init.body).searchAd.keywords, ["새 키워드"]);
});

test("a dedicated external UUID binding uses the same details/update editor and eligibility gate", async (t) => {
  const campaign = { ...item, creationRequestId: "32345678-1234-5234-8234-123456789abc" };
  const ui = await editorFixture(t, { campaign });
  assert.equal(ui.byText("수정").props.disabled, false);
  ui.byText("수정").props.onClick(); ui.render();
  ui.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); await flush(); ui.render();
  assert.ok(ui.calls.find((call) => call.url.endsWith(`/managed/${campaign.creationRequestId}/updates`) && call.init.method === "POST"));
  assert.ok(ui.calls.at(-1).url.endsWith(`/managed/${campaign.creationRequestId}`));
});

test("editor rejects a binding resolving to a sibling ad rather than the selected resource", async (t) => {
  const ui = await editorFixture(t, { adResourceName: `customers/${item.customerId}/adGroupAds/456~999` });
  assert.equal(ui.byText("수정").props.disabled, true);
  assert.equal(ui.find((node) => node.type === detailComponents.GoogleAdsStoredDetails), undefined);
});

test("pinned metadata is validated by slot and hides all asset add/remove controls while keeping text editable", () => {
  const value = managed();
  value.details.headlineAssets = value.details.headlines.map((text, i) => ({ text, pinnedField: i === 0 ? "HEADLINE_1" : null }));
  value.details.descriptionAssets = value.details.descriptions.map((text) => ({ text, pinnedField: "UNSPECIFIED" }));
  assert.ok(helpers.isManagedDetails(value));
  const html = renderToStaticMarkup(React.createElement(GoogleAdsSearchAdFields, { fields: helpers.managedSearchAdFields(value), setFields() {}, errors: {}, disabled: false, headlineAssets: value.details.headlineAssets, descriptionAssets: value.details.descriptionAssets }));
  assert.match(html, /고정: HEADLINE_1/);
  assert.doesNotMatch(html, /aria-label="광고 (제목|설명).*?(추가|삭제)"/);
  assert.doesNotMatch(html, /<fieldset disabled/);
  for (const headlineAssets of [[], [{ text: "different", pinnedField: "HEADLINE_1" }], value.details.headlineAssets.map((asset) => ({ ...asset, pinnedField: 1 }))]) assert.equal(helpers.isManagedDetails({ ...value, details: { ...value.details, headlineAssets } }), false);
  assert.match(helpers.managedErrorMessage("GOOGLE_ADS_PINNED_ASSETS_REQUIRED"), /위치와 개수/);
});

test("pin count rejection is a known terminal rejection with specific copy, not an uncertain replay", async () => {
  const outcome = await helpers.submitAdUpdate(draft(), { update: async () => { throw new helpers.ManagedApiError("GOOGLE_ADS_PINNED_ASSETS_REQUIRED", 409); } }, () => {});
  assert.equal(outcome.draft.phase, "failed"); assert.match(outcome.error, /고정된 광고 제목/);
});

test("enabled negative keywords remain visible but do not prevent editing paused positive keywords", async (t) => {
  const value = discovery(); value.adGroups[0].keywords.find((keyword) => keyword.negative).status = "ENABLED";
  const ui = await discoveryFixture(t, { value, props: { initialCreationRequestId: creationId } });
  const editor = ui.find((node) => node.type === ui.components.ManagedCampaignEditor);
  assert.equal(editor.props.readonlyReason, "");
  assert.equal(editor.props.adResourceName, managed().details.adResourceName);
  assert.match(renderToStaticMarkup(ui.find((node) => node.props["aria-label"] === "광고그룹 저장 내용")), /제외 키워드: 제외 검색어/);
});

test("enabled positive keywords keep discovery editor read-only without conversion", async (t) => {
  const value = discovery(); value.adGroups[0].keywords[0].status = "ENABLED";
  const ui = await discoveryFixture(t, { value, props: { initialCreationRequestId: creationId } });
  assert.match(ui.find((node) => node.type === ui.components.ManagedCampaignEditor).props.readonlyReason, /일시중지/);
  assert.equal(ui.calls.length, 1);
  assert.equal(value.adGroups[0].keywords[0].status, "ENABLED");
});

test("root readonlyReason is validated, takes precedence, and blocks the editor without an own pending request", async (t) => {
  const reason = "같은 광고그룹의 다른 요청 결과를 먼저 확인해 주세요.";
  assert.equal(helpers.isManagedDetails({ ...managed(), readonlyReason: 42 }), false);
  assert.equal(helpers.isManagedDetails({ ...managed(), details: { ...managed().details, readonlyReason: {} } }), false);
  const value = { ...managed(), canEdit: false, readonlyReason: reason, pendingUpdate: null };
  assert.ok(helpers.isManagedDetails(value));
  assert.equal(helpers.managedSearchAdFields(value), null);
  assert.equal(helpers.managedReadonlyReason({ ...value, details: { ...value.details, readonlyReason: "다른 이유" } }), reason);
  const ui = await editorFixture(t, { details: value });
  assert.equal(ui.byText("수정").props.disabled, true);
  assert.equal(ui.byText("수정").props.title, reason);
  assert.match(renderToStaticMarkup(ui.render()), new RegExp(reason));
});

test("supported external binding still cannot edit an ineligible account", async (t) => {
  const ui = await editorFixture(t, { campaign: { ...item, creationRequestId: "32345678-1234-5234-8234-123456789abc" }, eligible: false });
  assert.equal(ui.byText("수정").props.disabled, true);
  assert.match(renderToStaticMarkup(ui.render()), /수정 대상이 아닙니다/);
});

test("manager resolves an imported UUID deep link missing from the legacy managed list before discovery", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const report = buildFixtureReport();
  report.accounts[0].customerId = item.customerId;
  report.accounts[0].campaigns.push({ ...report.accounts[0].campaigns[0], id: item.campaignId });
  const externalId = "32345678-1234-5234-8234-123456789abc";
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return Response.json(url.includes("/report?") ? report : url.endsWith("/managed") ? { items: [] } : { ...managed(), creationRequestId: externalId });
  };
  const harness = hookHarness();
  t.after(() => harness.cleanup());
  const { GoogleAdsCampaignManager, CampaignAdDiscovery } = await loadTs("../components/campaigns/google-ads-campaign-manager.tsx", { ...dependencies, react: { ...React, ...harness.hooks } });
  const props = { workspace: { ...fixtureWorkspaces[0], id: report.workspaceId }, userId: "u1", initialCreationRequestId: externalId };
  harness.render(GoogleAdsCampaignManager, props); await flush();
  const tree = harness.render(GoogleAdsCampaignManager, props);
  const discover = nodes(tree).find((node) => node.type === CampaignAdDiscovery);
  assert.equal(discover.props.initialCreationRequestId, externalId);
  assert.equal(discover.props.campaignId, item.campaignId);
  assert.ok(calls.some((url) => url.endsWith(`/managed/${externalId}`)));
});
