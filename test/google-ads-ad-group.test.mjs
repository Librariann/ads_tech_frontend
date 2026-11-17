import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
async function loadTs(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), loaded, loaded.exports);
  return loaded.exports;
}
const search = await loadTs("../lib/integrations/google-ads-search-ad.ts");
const campaign = await loadTs("../lib/integrations/google-ads-campaign.ts", { "./google-ads-search-ad": search });
const helpers = await loadTs("../lib/integrations/google-ads-ad-group.ts", { "./google-ads-campaign": campaign, "./google-ads-search-ad": search });
const report = await loadTs("../lib/integrations/google-ads-report.ts");
const managed = await loadTs("../lib/integrations/google-ads-managed.ts", { "./google-ads-campaign": campaign, "./google-ads-search-ad": search });
const fieldsModule = await loadTs("../components/campaigns/google-ads-search-ad-fields.tsx", { "@/lib/integrations/google-ads-search-ad": search });
const { GoogleAdsSearchAdFields } = fieldsModule;
const link = ({ children, ...props }) => React.createElement("a", props, children);
const dependencies = {
  "@/lib/integrations/google-ads-campaign": campaign,
  "@/lib/integrations/google-ads-ad-group": helpers,
  "@/lib/integrations/google-ads-search-ad": search,
  "./google-ads-search-ad-fields": fieldsModule,
  "next/link": link,
};
const scope = { accountId: "50", customerId: "6687440172", campaignId: "12345", campaignName: "기존 캠페인", currency: "KRW" };
const requestId = "12345678-1234-4234-8234-123456789abc";
const managementId = "22345678-1234-4234-8234-123456789abc";
const searchAd = { adGroupName: "광고그룹", cpcBidMicros: "100000000", finalUrl: "https://example.com/", headlines: ["광고 관리", "현황 확인", "새 검색광고"], descriptions: ["광고 현황을 확인하세요.", "광고를 간편하게 관리하세요."], keywords: ["광고 관리", "구글 광고"], keywordMatchType: "EXACT" };
const input = () => ({ requestId, version: "a".repeat(64), searchAd: structuredClone(searchAd) });
const prepare = () => ({ ...scope, version: "a".repeat(64) });
const draft = (phase = "submitted") => ({ schema: 1, scope: { ...scope }, input: input(), phase });
const result = (status = "created") => ({ ...scope, requestId, status, searchAd: structuredClone(searchAd),
  adGroupId: status === "created" ? "456" : null, adResourceName: status === "created" ? `customers/${scope.customerId}/adGroupAds/456~789` : null,
  keywordResourceNames: status === "created" ? searchAd.keywords.map((_, i) => `customers/${scope.customerId}/adGroupCriteria/456~${i + 1}`) : [],
  managementId: status === "created" ? managementId : null, errorCode: null, createdAt: "2026-11-02T01:00:00Z", updatedAt: "2026-11-02T01:01:00Z" });

test("exact input allowlist reuses full SearchAd, strict v4 UUID and version", () => {
  assert.deepEqual(helpers.adGroupInput(input()), input());
  for (const key of ["accountId", "campaignId", "campaignName", "dailyBudgetMicros", "status", "managementId", "keywordRemovalConsent"]) assert.equal(helpers.adGroupInput({ ...input(), [key]: "1" }), null);
  for (const change of [{ requestId: managementId.replace("4234", "1234") }, { requestId: `${requestId}\n` }, { version: "f".repeat(63) }, { version: `${"a".repeat(64)}\n` }, { version: "g".repeat(64) }, { searchAd: { ...searchAd, status: "ENABLED" } }, { searchAd: { ...searchAd, keywords: [] } }]) assert.equal(helpers.adGroupInput({ ...input(), ...change }), null);
});

test("prepare and operation require strict identity, status, timestamps and actual resources", () => {
  assert.ok(helpers.isAdGroupPrepare(prepare()));
  for (const change of [{ version: "bad" }, { customerId: "1" }, { accountId: "50\n" }, { currency: "KRW\n" }, { campaignId: "1\n" }, { version: undefined }, { campaignName: "" }]) assert.equal(helpers.isAdGroupPrepare({ ...prepare(), ...change }), false);
  for (const status of ["creating", "created", "failed", "unknown"]) assert.ok(helpers.isAdGroupResult(result(status)));
  for (const change of [{ status: ["created"] }, { updatedAt: "bad" }, { managementId: requestId.replace("4234", "1234") }, { managementId: null }, { adGroupId: null }, { keywordResourceNames: [] }, { adResourceName: "customers/9999999999/adGroupAds/456~789" }, { keywordResourceNames: [result().keywordResourceNames[0], result().keywordResourceNames[0]] }]) assert.equal(helpers.isAdGroupResult({ ...result(), ...change }), false);
});

test("durable exact intent is scoped to user/workspace/account/customer/campaign; malformed storage fails closed", () => {
  const key = helpers.adGroupStorageKey("u1", "900", scope);
  for (const args of [["u2", "900", scope], ["u1", "901", scope], ...["accountId", "customerId", "campaignId"].map((key) => ["u1", "900", { ...scope, [key]: "999" }])]) assert.notEqual(key, helpers.adGroupStorageKey(...args));
  assert.deepEqual(helpers.parseAdGroupDraft(JSON.stringify(draft()), scope), draft());
  for (const value of [null, { ...draft(), token: "secret" }, { ...draft(), schema: 2 }, { ...draft(), phase: "ready" }, { ...draft(), phase: ["failed"] }, { ...draft(), input: { ...input(), accountId: "50" } }, { ...draft(), scope: { ...scope, customerId: "9999999999" } }]) assert.equal(helpers.parseAdGroupDraft(JSON.stringify(value), scope), null);
  assert.equal(helpers.parseAdGroupDraft("broken", scope), null);
});

test("campaign rename is presentation metadata: old journal remains recoverable with exact frozen audit name", async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const renamed = { ...scope, campaignName: "변경된 현재 이름" };
  const saved = { ...draft("unknown"), scope: { ...scope, campaignName: "요청 당시 이름" } };
  assert.equal(helpers.adGroupStorageKey("u1", "900", renamed), helpers.adGroupStorageKey("u1", "900", saved.scope));
  const restored = helpers.parseAdGroupDraft(JSON.stringify(saved), renamed);
  assert.deepEqual(restored, saved);
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ ...result(), campaignName: "서버의 최신 이름" }); };
  const writes = [];
  const recovered = await helpers.recoverAdGroup(restored, helpers.adGroupApi("900", renamed), (value) => writes.push(value));
  assert.equal(recovered.draft.phase, "created");
  assert.equal(recovered.result.campaignName, "서버의 최신 이름");
  assert.equal(recovered.draft.scope.campaignName, "요청 당시 이름");
  assert.deepEqual(recovered.draft.input, saved.input);
  assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith(`/ad-group-requests/${requestId}`));
  assert.equal(calls[0].init.method, undefined);
  globalThis.fetch = async () => Response.json({ ...prepare(), campaignName: "준비 응답의 새 이름" });
  assert.equal((await helpers.adGroupApi("900", renamed).prepare()).campaignName, "준비 응답의 새 이름");
  globalThis.fetch = async () => Response.json({ ...prepare(), campaignName: null });
  await assert.rejects(helpers.adGroupApi("900", renamed).prepare(), (error) => error.code === "AD_GROUP_RESPONSE_INVALID");
});

test("persist BEFORE POST, GET-only lost-response recovery, and no retry with a stored intent", async () => {
  const events = [];
  const api = { create: async (body) => { events.push(["POST", body]); throw new TypeError("lost"); }, lookup: async (id) => { events.push(["GET", id]); return result(); } };
  const outcome = await helpers.submitAdGroup(draft("ready"), api, (value) => events.push(["save", structuredClone(value)]));
  assert.equal(events[0][0], "save"); assert.equal(events[0][1].phase, "submitted");
  assert.deepEqual(events[1], ["POST", input()]);
  assert.equal(outcome.draft.phase, "created");
  events.length = 0;
  await helpers.recoverAdGroup(outcome.draft, api, () => {});
  assert.deepEqual(events, [["GET", requestId]]);
  await assert.rejects(helpers.submitAdGroup(outcome.draft, api, () => {}), /locked/);
  let posts = 0;
  await assert.rejects(helpers.submitAdGroup(draft("ready"), { create: async () => { posts++; } }, () => { throw new Error("storage failed"); }), /storage failed/);
  assert.equal(posts, 0);
});

test("unknown/pending/invalid/lost outcomes never duplicate even after missing GET, and response identity includes exact SearchAd", async () => {
  for (const code of [undefined, "GOOGLE_ADS_AD_GROUP_PENDING", "GOOGLE_ADS_AD_GROUP_RESULT_UNKNOWN", "IDEMPOTENCY_CONFLICT", "AD_GROUP_RESPONSE_INVALID"]) {
    let posts = 0;
    const api = { create: async () => { posts++; throw new helpers.AdGroupApiError(code, 409); }, lookup: async () => { throw new helpers.AdGroupApiError(undefined, 404); } };
    const outcome = await helpers.submitAdGroup(draft("ready"), api, () => {});
    assert.equal(outcome.draft.phase, "unknown");
    const recovered = await helpers.recoverAdGroup(outcome.draft, api, () => {});
    await assert.rejects(helpers.submitAdGroup(recovered.draft, api, () => {}), /locked/);
    assert.equal(posts, 1);
  }
  for (const changes of [...["accountId", "customerId", "campaignId", "currency"].map((key) => ({ [key]: key === "currency" ? "USD" : "999" })), { requestId: managementId }, { searchAd: { ...searchAd, adGroupName: "다른 내용" } }]) {
    const outcome = await helpers.recoverAdGroup(draft(), { lookup: async () => ({ ...result(), ...changes }) }, () => {});
    assert.equal(outcome.draft.phase, "unknown"); assert.equal(outcome.result, null);
  }
  const uncertain = await helpers.recoverAdGroup(draft("unknown"), { lookup: async () => result("creating") }, () => {});
  assert.equal(uncertain.draft.phase, "unknown");
});

test("explicit stale/paused/nonempty/type/rejected failures are terminal but cannot be reposted", async () => {
  for (const code of ["GOOGLE_ADS_CAMPAIGN_CHANGED", "GOOGLE_ADS_PAUSED_REQUIRED", "GOOGLE_ADS_CAMPAIGN_NOT_EMPTY", "GOOGLE_ADS_CAMPAIGN_TYPE_UNSUPPORTED", "GOOGLE_ADS_AD_GROUP_REJECTED"]) {
    const outcome = await helpers.submitAdGroup(draft("ready"), { create: async () => { throw new helpers.AdGroupApiError(code, 409); } }, () => {});
    assert.equal(outcome.draft.phase, "failed"); assert.ok(outcome.error);
    await assert.rejects(helpers.submitAdGroup(outcome.draft, {}, () => {}), /locked/);
  }
});

test("same-origin API contract uses no-store, validates all prepare/operation identity before enabling", async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json(url.endsWith("/prepare") ? prepare() : result()); };
  const api = helpers.adGroupApi("900", scope);
  await api.prepare(); await api.create(input()); await api.lookup(requestId);
  assert.deepEqual(calls.map(({ url }) => url.split("/campaigns/")[1]), ["accounts/50/12345/ad-groups/prepare", "accounts/50/12345/ad-groups", `ad-group-requests/${requestId}`]);
  for (const { init } of calls) { assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "same-origin"); }
  assert.deepEqual(JSON.parse(calls[1].init.body), input());
  for (const key of ["accountId", "customerId", "campaignId", "currency"]) {
    globalThis.fetch = async (url) => Response.json({ ...(url.endsWith("/prepare") ? prepare() : result()), [key]: key === "currency" ? "USD" : "999" });
    await assert.rejects(api.prepare(), (error) => error.code === "AD_GROUP_RESPONSE_INVALID");
    await assert.rejects(api.lookup(requestId), (error) => error.code === "AD_GROUP_RESPONSE_INVALID");
  }
  globalThis.fetch = async () => Response.json({ ...result(), requestId: managementId });
  await assert.rejects(api.lookup(requestId), (error) => error.code === "AD_GROUP_RESPONSE_INVALID");
});

const proxyCalls = [];
let proxyStatus = 200;
const route = await loadTs("../app/api/workspaces/[workspaceId]/integrations/google-ads/[...path]/route.ts", {
  ...dependencies, "@/lib/integrations/google-ads-report": report,
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  "@/lib/auth/proxy": { proxyAuthenticatedJson: async (path, init) => { proxyCalls.push({ path, init }); return Response.json({ code: proxyStatus === 403 ? "FORBIDDEN" : "ok" }, { status: proxyStatus, headers: { "Set-Cookie": "refreshed=yes; HttpOnly" } }); } },
});
const context = (path, workspaceId = "900") => ({ params: Promise.resolve({ workspaceId, path: ["campaigns", ...path] }) });
const writePath = ["accounts", "50", "12345", "ad-groups"];
const preparePath = [...writePath, "prepare"];
const lookupPath = ["ad-group-requests", requestId];
const post = (body = input(), headers = {}, suffix = "") => new Request(`http://localhost/api/campaigns${suffix}`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("BFF exact new allowlist, authenticated forwarding, cookie/auth denial passthrough and private no-store", async () => {
  proxyCalls.length = 0;
  for (const path of [preparePath, lookupPath]) {
    const response = await route.GET(new Request("http://localhost/api/campaigns"), context(path));
    assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Set-Cookie"), /refreshed/);
    assert.equal(proxyCalls.at(-1).path, `/workspaces/900/integrations/google-ads/campaigns/${path.join("/")}`);
    assert.equal(proxyCalls.at(-1).init.body, undefined);
    assert.equal((await route.POST(post(), context(path))).status, 404);
    assert.equal((await route.GET(new Request("http://localhost/api/campaigns?x=1"), context(path))).status, 400);
  }
  assert.equal((await route.POST(post(), context(writePath))).status, 200);
  assert.deepEqual(JSON.parse(proxyCalls.at(-1).init.body), input());
  for (const call of proxyCalls) assert.equal(call.init.cache, "no-store");
  const before = proxyCalls.length;
  for (const path of [[...preparePath, "extra"], [...writePath, "other"], ["accounts", "050", "12345", "ad-groups", "prepare"], ["accounts", "50", "12345\n", "ad-groups", "prepare"], ["ad-group-requests", "bad"], ["ad-group-requests", `${requestId}\n`], ["ad-group-requests", requestId.replace("4234", "1234")], writePath]) assert.equal((await route.GET(new Request("http://localhost/api/campaigns"), context(path))).status, 404);
  for (const id of ["900\n", "../900", "0"]) assert.equal((await route.POST(post(), context(writePath, id))).status, 404);
  assert.equal(proxyCalls.length, before);
  try {
    for (proxyStatus of [401, 403]) {
      const response = await route.POST(post(), context(writePath));
      assert.equal(response.status, proxyStatus); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  } finally { proxyStatus = 200; }
});

test("BFF rejects unknown query/body, cross-origin, non-JSON, invalid UTF8, and caps streaming bytes at 16KiB", async () => {
  proxyCalls.length = 0;
  for (const headers of [{ origin: "" }, { origin: "null" }, { origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }]) assert.equal((await route.POST(post(input(), headers), context(writePath))).status, 403);
  assert.equal((await route.POST(post(input(), { "content-type": "text/plain" }), context(writePath))).status, 415);
  assert.equal((await route.POST(post(input(), {}, "?x=1"), context(writePath))).status, 400);
  for (const body of [{ ...input(), accountId: "50" }, { ...input(), dailyBudgetMicros: "1" }, { ...input(), campaignName: "changed" }, { ...input(), searchAd: { ...searchAd, status: "ENABLED" } }, { ...input(), searchAd: { ...searchAd, keywords: [] } }]) assert.equal((await route.POST(post(body), context(writePath))).status, 400);
  assert.equal(proxyCalls.length, 0);
  const raw = JSON.stringify(input());
  const request = (body) => new Request("http://localhost/api/campaigns", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body });
  assert.equal((await route.POST(request(raw + " ".repeat(16384 - Buffer.byteLength(raw))), context(writePath))).status, 200);
  assert.equal((await route.POST(request(raw + " ".repeat(16385 - Buffer.byteLength(raw))), context(writePath))).status, 413);
  assert.equal((await route.POST(request(new Uint8Array([0xff, 0xfe])), context(writePath))).status, 400);
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
  const streamed = new Request("http://localhost/api/campaigns", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" }, body: stream, duplex: "half" });
  assert.equal((await route.POST(streamed, context(writePath))).status, 413); assert.ok(cancelled);
});

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
function harness() {
  let cursor = 0; let effects = []; const slots = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const hooks = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === "function" ? initial() : initial }; return [slots[i].value, (action) => { slots[i].value = typeof action === "function" ? action(slots[i].value) : action; }]; },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !equal(slots[i].deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  return { hooks, render(Component, props) { cursor = 0; const tree = Component(props); const pending = effects; effects = []; pending.forEach((fn) => fn()); return tree; }, cleanup() { slots.forEach((slot) => slot?.cleanup?.()); }, replay() { slots.forEach((slot) => { if (slot?.cleanup) { slot.cleanup(); slot.deps = undefined; } }); } };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
const workspace = { id: "900", role: "owner", timezone: "Asia/Seoul" };
async function formFixture(t, options = {}) {
  const original = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window };
  const storage = new Map(); const calls = []; const listeners = new Map();
  const key = helpers.adGroupStorageKey("u1", "900", scope);
  if (options.stored) storage.set(key, JSON.stringify(options.stored));
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { if (options.storageFails) throw new Error("blocked"); storage.set(key, value); } };
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      assert.deepEqual(helpers.parseAdGroupDraft(storage.get(key), scope).input, body);
      assert.equal(helpers.parseAdGroupDraft(storage.get(key), scope).phase, "submitted");
      if (options.lost) throw new TypeError("lost response");
      if (options.stale) return Response.json({ code: "GOOGLE_ADS_CAMPAIGN_CHANGED" }, { status: 409 });
      if (options.post) return options.post(url, init);
      return Response.json({ ...result(options.unknown ? "unknown" : "created"), requestId: body.requestId, searchAd: body.searchAd });
    }
    if (url.includes("ad-group-requests")) {
      if (options.lookupMissing) return Response.json({}, { status: 404 });
      return Response.json({ ...result(options.unknown ? "unknown" : "created"), requestId: url.split("/").at(-1) });
    }
    if (options.prepare) return options.prepare(url, init);
    return Response.json({ ...prepare(), version: calls.filter((call) => call.url.endsWith("/prepare")).length > 1 ? "b".repeat(64) : "a".repeat(64) });
  };
  const hooks = harness();
  const Component = (await loadTs("../components/campaigns/google-ads-ad-group-create-form.tsx", { ...dependencies, react: { ...React, ...hooks.hooks } })).GoogleAdsAdGroupCreateForm;
  const props = { workspace, userId: "u1", scope: { ...scope }, eligible: true, ...options.props };
  let tree;
  const render = () => { tree = hooks.render(Component, props); return tree; };
  const find = (predicate) => nodes(tree).find(predicate);
  const button = (text) => find((node) => node.type === "button" && node.props.children?.includes?.(text));
  const fill = () => { find((node) => node.type === GoogleAdsSearchAdFields).props.setFields({ ...searchAd, bid: "100", keywords: searchAd.keywords.join("\n") }); render(); };
  const submit = () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  t.after(() => { hooks.cleanup(); Object.assign(globalThis, original); });
  render();
  return { render, find, button, fill, submit, calls, storage, props, hooks, listeners, key };
}

test("initial form waits gray/disabled, enables white fields only after strict prepare, no campaign/budget controls", async (t) => {
  let resolve;
  const ui = await formFixture(t, { prepare: () => new Promise((done) => { resolve = done; }) });
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  assert.equal(ui.button("광고 내용 저장"), undefined);
  await flush(); resolve(Response.json(prepare())); await flush(); ui.render();
  const fields = ui.find((node) => node.type === GoogleAdsSearchAdFields);
  assert.equal(fields.props.disabled, false);
  const html = renderToStaticMarkup(fields);
  assert.match(html, /bg-white/); assert.match(html, /disabled:bg-\[#e9ecef\]/);
  assert.doesNotMatch(html, /name="(?:name|campaignName|dailyBudget|dailyBudgetMicros)"/);
  assert.ok(ui.button("광고 내용 저장"));
  assert.equal(ui.calls.length, 1);
});

test("prepare identity mismatch keeps inputs locked and retryable with one GET CTA", async (t) => {
  const ui = await formFixture(t, { prepare: async () => Response.json({ ...prepare(), campaignId: "999" }) });
  await flush(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  assert.equal(ui.button("광고 내용 저장"), undefined);
  assert.ok(ui.find((node) => node.props.role === "alert"));
  assert.equal(nodes(ui.render()).filter((node) => node.type === "button").length, 1);
});

test("success displays actual resources and links using NEW managementId, never requestId", async (t) => {
  const ui = await formFixture(t); await flush(); ui.render(); ui.fill();
  const pending = ui.submit();
  await ui.submit(); await pending; ui.render();
  assert.equal(ui.calls.filter(({ init }) => init.method === "POST").length, 1);
  const createdLink = ui.find((node) => node.type === link);
  assert.equal(createdLink.props.href, `/workspaces/900/campaigns?creationRequestId=${managementId}`);
  const html = renderToStaticMarkup(ui.find((node) => node.props["aria-label"] === "추가된 광고 리소스"));
  assert.match(html, /customers\/6687440172\/adGroupAds\/456~789/);
  assert.match(html, /adGroupCriteria\/456~1/);
  assert.equal(ui.button("광고 내용 저장"), undefined);
  const body = JSON.parse(ui.calls.find(({ init }) => init.method === "POST").init.body);
  assert.deepEqual(Object.keys(body), ["requestId", "version", "searchAd"]);
});

test("unknown stays locked through refresh/remount and never repeats POST, even when lookup returns 404", async (t) => {
  const ui = await formFixture(t, { lost: true, lookupMissing: true }); await flush(); ui.render(); ui.fill();
  await ui.submit(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  assert.equal(ui.button("새 요청 준비"), undefined);
  ui.button("요청 상태 확인").props.onClick(); ui.render(); await flush(); ui.render();
  ui.hooks.replay(); ui.render(); await flush(); ui.render();
  assert.equal(ui.calls.filter(({ init }) => init.method === "POST").length, 1);
  assert.equal(ui.calls.filter(({ url }) => url.endsWith("/prepare")).length, 1);
  assert.equal(helpers.parseAdGroupDraft(ui.storage.get(ui.key), scope).phase, "unknown");
  assert.equal(ui.button("광고 내용 저장"), undefined);
});

test("persisted request restoration is GET-only; stale 409 requires explicit fresh prepare and new UUID", async (t) => {
  const ui = await formFixture(t, { stale: true }); await flush(); ui.render(); ui.fill();
  await ui.submit(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  assert.ok(ui.button("새 요청 준비"));
  const first = JSON.parse(ui.calls.find(({ init }) => init.method === "POST").init.body);
  ui.button("새 요청 준비").props.onClick(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  await flush(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, false);
  await ui.submit(); ui.render();
  const second = JSON.parse(ui.calls.filter(({ init }) => init.method === "POST")[1].init.body);
  assert.notEqual(second.requestId, first.requestId); assert.equal(second.version, "b".repeat(64));
});

test("restored submitted intent never prepares or posts", async (t) => {
  const ui = await formFixture(t, { stored: draft(), unknown: true }); await flush(); ui.render();
  assert.equal(ui.calls.length, 1); assert.ok(ui.calls[0].url.endsWith(`/ad-group-requests/${requestId}`));
  assert.equal(ui.button("광고 내용 저장"), undefined);
});

test("storage failure blocks POST", async (t) => {
  const ui = await formFixture(t, { storageFails: true }); await flush(); ui.render(); ui.fill(); await ui.submit(); ui.render();
  assert.equal(ui.calls.filter(({ init }) => init.method === "POST").length, 0);
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
});

test("corrupted journal never prepares or posts, and remains preserved", async (t) => {
  const ui = await formFixture(t, { stored: { ...draft(), input: { ...input(), campaignId: scope.campaignId } } });
  const raw = ui.storage.get(ui.key);
  await flush(); ui.render();
  assert.equal(ui.calls.length, 0); assert.equal(ui.storage.get(ui.key), raw);
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
});

test("form shows fresh prepare name and freezes it into intent, not stale discovery name", async (t) => {
  const ui = await formFixture(t, { unknown: true, prepare: async () => Response.json({ ...prepare(), campaignName: "준비 시점 이름" }) });
  await flush(); ui.render();
  assert.match(renderToStaticMarkup(ui.find((node) => node.type === "p")), /준비 시점 이름/);
  ui.fill(); await ui.submit(); ui.render();
  assert.equal(helpers.parseAdGroupDraft(ui.storage.get(ui.key), scope).scope.campaignName, "준비 시점 이름");
});

test("UI restores a renamed pending journal by GET alone and displays result name plus frozen audit name", async (t) => {
  const ui = await formFixture(t, { stored: { ...draft(), scope: { ...scope, campaignName: "요청 당시 이름" } }, props: { scope: { ...scope, campaignName: "조회 당시 이름" } } });
  await flush(); ui.render();
  assert.equal(ui.calls.length, 1); assert.ok(ui.calls[0].url.includes("ad-group-requests"));
  const html = renderToStaticMarkup(ui.find((node) => node.type === "form"));
  assert.match(html, /기존 캠페인 · 캠페인 12345/);
  assert.match(html, /요청 당시 캠페인 이름: 요청 당시 이름/);
  assert.ok(ui.find((node) => node.type === link));
  assert.equal(helpers.parseAdGroupDraft(ui.storage.get(ui.key), scope).scope.campaignName, "요청 당시 이름");
});

test("ineligible accounts and disallowed roles never prepare or enable", async (t) => {
  const ui = await formFixture(t, { props: { eligible: false } }); await flush(); ui.render();
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  ui.props.eligible = true;
  ui.props.workspace = { ...workspace, role: "viewer" };
  ui.render(); await flush(); ui.render();
  assert.equal(ui.calls.length, 0);
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
});

test("campaign scope change aborts prepare; late result cannot enable another campaign; unmount aborts", async (t) => {
  let resolveOld;
  const ui = await formFixture(t, { prepare: (url) => url.includes("/12345/") ? new Promise((done) => { resolveOld = done; }) : Promise.resolve(Response.json({ ...prepare(), campaignId: "98765", campaignName: "다른 캠페인" })) });
  await flush();
  ui.props.scope = { ...scope, campaignId: "98765", campaignName: "다른 캠페인" };
  ui.render(); await flush(); ui.render();
  assert.equal(ui.calls[0].init.signal.aborted, true);
  resolveOld(Response.json(prepare())); await flush(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, false);
  ui.hooks.cleanup();
  assert.equal(ui.calls[1].init.signal.aborted, true);
  assert.equal(ui.calls.filter(({ init }) => init.method === "POST").length, 0);
});

test("late POST success after unmount does not create a success UI or overwrite another scope", async (t) => {
  let resolve;
  const ui = await formFixture(t, { post: (_url, init) => new Promise((done) => { resolve = () => done(Response.json({ ...result(), requestId: JSON.parse(init.body).requestId })); }) });
  await flush(); ui.render(); ui.fill(); const pending = ui.submit();
  ui.hooks.cleanup(); resolve(); await pending;
  assert.equal(helpers.parseAdGroupDraft(ui.storage.get(ui.key), scope).phase, "submitted");
  assert.equal(ui.calls.find(({ init }) => init.method === "POST").init.signal.aborted, true);
});

test("late POST cannot bleed into a newly selected campaign or overwrite either scoped journal", async (t) => {
  let resolve;
  const ui = await formFixture(t, {
    prepare: async (url) => Response.json(url.includes("/98765/") ? { ...prepare(), campaignId: "98765", campaignName: "다른 캠페인" } : prepare()),
    post: (_url, init) => new Promise((done) => { resolve = () => done(Response.json({ ...result(), requestId: JSON.parse(init.body).requestId })); }),
  });
  await flush(); ui.render(); ui.fill(); const pending = ui.submit();
  const originalKey = ui.key;
  ui.props.scope = { ...scope, campaignId: "98765", campaignName: "다른 캠페인" };
  ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.fields.adGroupName, "");
  await flush(); ui.render();
  resolve(); await pending; ui.render();
  assert.equal(ui.find((node) => node.type === link), undefined);
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, false);
  assert.equal(helpers.parseAdGroupDraft(ui.storage.get(originalKey), scope).phase, "submitted");
  assert.equal(ui.storage.get(helpers.adGroupStorageKey("u1", "900", ui.props.scope)), undefined);
});

test("cross-tab pending intent invalidates prepared form and triggers GET-only recovery", async (t) => {
  const ui = await formFixture(t, { unknown: true }); await flush(); ui.render(); ui.fill();
  ui.storage.set(ui.key, JSON.stringify(draft()));
  ui.listeners.get("storage")({ key: ui.key }); ui.render(); await flush(); ui.render();
  assert.equal(ui.find((node) => node.type === GoogleAdsSearchAdFields).props.disabled, true);
  assert.equal(ui.calls.filter(({ init }) => init.method === "POST").length, 0);
  assert.ok(ui.calls.at(-1).url.includes("ad-group-requests"));
});

test("discovery mounts exactly one add form ONLY under an empty, verified campaign, with immutable keyed scope", async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const Form = () => null;
  let groups = [];
  globalThis.fetch = async () => Response.json({ ...scope, campaignStatus: "PAUSED", adGroups: groups });
  const hooks = harness();
  const { CampaignAdDiscovery } = await loadTs("../components/campaigns/google-ads-campaign-manager.tsx", {
    ...dependencies, react: { ...React, ...hooks.hooks },
    "@/lib/integrations/google-ads-managed": managed, "@/lib/integrations/google-ads-report": report,
    "./google-ads-campaign-details": { GoogleAdsStoredDetails: () => null },
    "./google-ads-ad-group-create-form": { GoogleAdsAdGroupCreateForm: Form },
  });
  const props = { workspace, userId: "u1", account: { ...scope, name: "계정", status: "ok", testAccount: true }, campaignId: scope.campaignId, initialCreationRequestId: "", eligible: true };
  let tree = hooks.render(CampaignAdDiscovery, props); await flush(); tree = hooks.render(CampaignAdDiscovery, props);
  const add = nodes(tree).find((node) => node.type === "button" && node.props.children?.includes?.("광고 내용 추가"));
  assert.ok(add); assert.equal(add.props.disabled, false); add.props.onClick();
  tree = hooks.render(CampaignAdDiscovery, props);
  const form = nodes(tree).find((node) => node.type === Form);
  assert.deepEqual(form.props.scope, scope); assert.ok(form.key.includes(scope.campaignId));
  assert.equal(nodes(tree).filter((node) => node.type === "button" && node.props.children?.includes?.("광고 내용 추가")).length, 0);
  props.account = { ...props.account, testAccount: false };
  hooks.render(CampaignAdDiscovery, props); await flush(); tree = hooks.render(CampaignAdDiscovery, props);
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.children?.includes?.("광고 내용 추가")).props.disabled, true);
  groups = [{ id: "456", name: "그룹", status: "PAUSED", type: "SEARCH_STANDARD", cpcBidMicros: "100", keywords: [], ads: [] }];
  props.campaignId = "98765";
  globalThis.fetch = async () => Response.json({ ...scope, campaignId: "98765", campaignStatus: "PAUSED", adGroups: groups });
  hooks.render(CampaignAdDiscovery, props); await flush(); tree = hooks.render(CampaignAdDiscovery, props);
  assert.equal(nodes(tree).find((node) => node.type === Form), undefined);
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.children?.includes?.("광고 내용 추가")), undefined);
  hooks.cleanup();
});
