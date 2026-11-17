import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createNaverManagementFixtureHandler } from "./fixtures/naver-management-backend.mjs";
import { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const dataUrl = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const transpile = (s) => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const naverUrl = dataUrl(transpile(await read("lib/integrations/naver.ts")));
const managementUrl = dataUrl(transpile(await read("lib/integrations/naver-management.ts")).replaceAll('"@/lib/integrations/naver"', JSON.stringify(naverUrl)));
const journalUrl = dataUrl(transpile(await read("lib/integrations/naver-management-journal.ts")).replaceAll('"@/lib/integrations/naver-management"', JSON.stringify(managementUrl)));
const journal = await import(journalUrl);
const hooksUrl = dataUrl("export const useState=(...args)=>globalThis.__naverManagementHooks.state(...args); export const useRef=(...args)=>globalThis.__naverManagementHooks.ref(...args); export const useEffect=(...args)=>globalThis.__naverManagementHooks.effect(...args);");
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const linkUrl = dataUrl(`import {jsx} from ${JSON.stringify(jsxUrl)}; export default function Link(props){return jsx("a",props);}`);
const remap = (s) => s.replaceAll('"react/jsx-runtime"', JSON.stringify(jsxUrl)).replaceAll('"react"', JSON.stringify(hooksUrl))
  .replaceAll('"next/link"', JSON.stringify(linkUrl)).replaceAll('"lucide-react"', JSON.stringify(pathToFileURL(require.resolve("lucide-react")).href))
  .replaceAll('"@/lib/integrations/naver"', JSON.stringify(naverUrl)).replaceAll('"@/lib/integrations/naver-management"', JSON.stringify(managementUrl))
  .replaceAll('"@/lib/integrations/naver-management-journal"', JSON.stringify(journalUrl));
const hooks = await import(dataUrl(remap(transpile(await read("components/campaigns/naver-management-state.ts")))));
const { NaverManagementForm } = await import(dataUrl(remap(transpile(await read("components/campaigns/naver-management-form.tsx")))));
const formStub = dataUrl(`import {jsx} from ${JSON.stringify(jsxUrl)}; export const naverButton=""; export const naverField=""; export function NaverManagementForm(p){return jsx("fieldset",{disabled:!p.enabled,"data-action":p.action,children:jsx("input",{defaultValue:p.initialAmount??""})});}`);
const stateStub = dataUrl("export const useNaverResource=(wid,path)=>globalThis.__naverUiResources(wid,path); export const useNaverOperations=()=>globalThis.__naverUiOperations;");
const ui = await import(dataUrl(remap(transpile(await read("components/campaigns/naver-management.tsx")))
  .replaceAll('"./naver-management-form"', JSON.stringify(formStub)).replaceAll('"./naver-management-state"', JSON.stringify(stateStub))));

function mount(component, initialProps = {}, renderHtml = false) {
  const slots = [], effects = []; let cursor, dirty = true, props = initialProps, value, html = "";
  const view = {
    state(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; dirty = true; }]; },
    ref(initial) { const [ref] = view.state(() => ({ current: initial })); return ref; },
    effect(callback, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((v, j) => !Object.is(v, previous.deps[j]))) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; }); },
    render() { cursor = 0; dirty = false; globalThis.__naverManagementHooks = view; value = component(props); if (renderHtml) html = renderToStaticMarkup(value); return value; },
    async settle() { for (let i = 0; i < 12; i++) { if (dirty) view.render(); effects.splice(0).forEach((f) => f()); await setImmediate(); } if (dirty) view.render(); return value; },
    update(next) { props = { ...props, ...next }; return view.render(); },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    get value() { return value; }, get html() { return html; },
  };
  view.render(); return view;
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((n) => find(n, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const byId = (view, id) => find(view.value, (n) => n.props?.id === id);
const event = (value) => ({ target: { value } });
const requestId = "0fa2e590-1234-4567-8901-123456789abc";
const intent = { requestId, accountId: "50", action: "create_campaign" };
const op = (status) => ({ ...intent, status, result: status === "succeeded" ? { campaignId: "cmp-1" } : null, errorCode: null, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" });
const campaign = { id: "cmp-1", name: "모의 캠페인", status: "PAUSED", campaignType: "WEB_SITE", userLock: true, dailyBudget: "1000" };
const group = { id: "grp-1", campaignId: "cmp-1", name: "모의 그룹", status: "PAUSED", adgroupType: "WEB_SITE", userLock: true, bidAmt: "100", pcChannelId: "site-1", mobileChannelId: "site-1" };
const keyword = { id: "kw-1", campaignId: "cmp-1", adgroupId: "grp-1", keyword: "모의 키워드", status: "PAUSED", userLock: true, bidAmt: "200", useGroupBidAmt: true };
const account = { id: "50", connectionId: "60", platform: "naver_ads", externalAccountId: "999999999", name: "모의 계정", currency: "KRW", timezone: "Asia/Seoul", status: "active", connectionStatus: "active" };
function globals() {
  const map = new Map(); globalThis.localStorage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  globalThis.window = new EventTarget(); return map;
}
const operationProps = { userId: "u1", workspaceId: "900", accountId: "50" };
const operationProbe = (p) => hooks.useNaverOperations(p.userId, p.workspaceId, p.accountId);

test("operation hook checks server pending even with no local journal, blocks unknown/404 after remount", async () => {
  for (const status of ["unknown", "404"]) {
    const storage = globals(), calls = [];
    storage.set(journal.naverIntentKey("u1", "900", "50"), JSON.stringify(intent));
    globalThis.fetch = async (url, init) => { calls.push([url, init]); return url.includes("pending?") ? Response.json(null) : status === "404" ? Response.json({}, { status: 404 }) : Response.json(op(status)); };
    const view = mount(operationProbe, operationProps); assert.equal(view.value.ready, false); await view.settle();
    assert.equal(view.value.ready, false); assert.ok(calls[0][0].endsWith("pending?accountId=50"));
    view.value.refresh(); await view.settle(); assert.ok(calls.every(([, init]) => init.method !== "POST")); view.unmount();
  }
  globals(); const calls = []; globalThis.fetch = async (url) => { calls.push(url); return Response.json(null); };
  const view = mount(operationProbe, operationProps); await view.settle(); assert.equal(view.value.ready, true); assert.equal(calls.length, 1); view.unmount();
});

test("operation hook locks double submission, persists before POST, reloads resources only on verified success", async () => {
  const storage = globals(); let finish; const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    if (init.method !== "POST") return Response.json(null);
    const sent = JSON.parse(init.body); assert.deepEqual(JSON.parse(storage.get(journal.naverIntentKey("u1", "900", "50"))), { requestId: sent.requestId, accountId: "50", action: "create_campaign" });
    return new Promise((resolve) => { finish = () => resolve(Response.json({ ...op("succeeded"), requestId: sent.requestId })); });
  };
  const view = mount(operationProbe, operationProps); await view.settle();
  const first = view.value.submit("create_campaign", { name: "실제 입력", dailyBudget: "1000" });
  await view.value.submit("create_campaign", { name: "두 번째 입력", dailyBudget: "2000" });
  view.render(); assert.equal(view.value.ready, false); assert.equal(view.value.resourceVersion, 0);
  assert.equal(calls.filter(([, i]) => i.method === "POST").length, 1);
  finish(); await first; await view.settle(); assert.equal(view.value.resourceVersion, 1); assert.equal(view.value.ready, true); view.unmount();
});

test("resource hook immediately hides stale workspace/account data and aborts late responses", async () => {
  const finishes = [], signals = [];
  globalThis.fetch = async (url, init) => { signals.push(init.signal); return new Promise((resolve) => finishes.push(() => resolve(Response.json([{ name: url }])))); };
  const parse = (v) => v;
  const probe = (p) => hooks.useNaverResource(p.workspaceId, p.path, parse, "0");
  const view = mount(probe, { workspaceId: "1", path: "campaigns?accountId=23" }); await view.settle();
  view.update({ workspaceId: "2", path: "campaigns?accountId=24" }); assert.equal(view.value.data, undefined); await view.settle(); assert.equal(signals[0].aborted, true);
  finishes[1](); await view.settle(); assert.match(view.value.data[0].name, /workspaces\/2\/.*accountId=24/);
  finishes[0](); await view.settle(); assert.doesNotMatch(view.value.data[0].name, /workspaces\/1\//); view.unmount();
});

test("late operation success from an old tenant/account cannot unlock a new scope or remove its intent", async () => {
  const storage = globals(); const oldKey = journal.naverIntentKey("u1", "900", "50"); storage.set(oldKey, JSON.stringify(intent)); let finish;
  globalThis.fetch = async (url) => url.includes("pending?") ? Response.json(null) : new Promise((resolve) => { finish = resolve; });
  const view = mount(operationProbe, operationProps); await view.settle();
  view.update({ workspaceId: "901", accountId: "51" }); assert.equal(view.value.ready, false); await view.settle();
  finish(Response.json(op("succeeded"))); await view.settle();
  assert.equal(view.value.resourceVersion, 0); assert.notEqual(storage.get(oldKey), undefined); assert.equal(view.value.recovery.operation, null); view.unmount();
});

test("disabled forms show empty gray inputs and cannot submit even through their handler", async () => {
  let writes = 0;
  const view = mount(NaverManagementForm, { action: "create_campaign", accountId: "", enabled: false, submit: async () => writes++ }, true);
  assert.match(view.html, /fieldset disabled/); assert.match(view.html, /disabled:bg/); assert.equal(byId(view, "naver-create_campaign-amount").props.value, "");
  await view.value.props.onSubmit({ preventDefault() {} }); assert.equal(writes, 0); view.unmount();
});

test("forms require actual SITE selections and emit one trimmed keyword, never bulk or implicit channel defaults", async () => {
  const calls = []; const channel = { id: "site-1", name: "모의 SITE", type: "SITE", url: null, status: "NORMAL" };
  let view = mount(NaverManagementForm, { action: "create_adgroup", accountId: "50", context: { campaignId: "cmp-1" }, channels: [channel], enabled: true, submit: async (...args) => calls.push(args) }, true);
  byId(view, "naver-create_adgroup-name").props.onChange(event("그룹")); byId(view, "naver-create_adgroup-amount").props.onChange(event("100")); view.render();
  assert.equal(byId(view, "naver-create_adgroup-pc").props.value, "");
  await view.value.props.onSubmit({ preventDefault() {} }); view.render(); assert.match(view.html, /각각 선택/); assert.equal(calls.length, 0);
  byId(view, "naver-create_adgroup-pc").props.onChange(event("site-1")); byId(view, "naver-create_adgroup-mobile").props.onChange(event("site-1")); view.render();
  await view.value.props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1); assert.equal(calls[0][1].mobileChannelId, "site-1"); view.unmount();
  view = mount(NaverManagementForm, { action: "create_keyword", accountId: "50", context: { campaignId: "cmp-1", adgroupId: "grp-1" }, enabled: true, submit: async (...args) => calls.push(args) }, true);
  byId(view, "naver-create_keyword-name").props.onChange(event("  단일 키워드  ")); byId(view, "naver-create_keyword-amount").props.onChange(event("200")); view.render();
  await view.value.props.onSubmit({ preventDefault() {} }); assert.deepEqual(calls[1], ["create_keyword", { campaignId: "cmp-1", adgroupId: "grp-1", keyword: "단일 키워드", bidAmt: "200" }]); view.unmount();
});

function mockUi({ campaigns = [campaign], groups = [group], keywords = [keyword], accounts = [account], channels = [] } = {}) {
  globalThis.__naverUiResources = (_, path) => ({ data: path === "accounts" ? accounts : path.startsWith("campaigns?") ? campaigns : path.startsWith("adgroups?") ? groups : path.startsWith("keywords?") ? keywords : channels, loading: false });
  globalThis.__naverUiOperations = { ready: true, loading: false, error: "", recovery: { intent: null, operation: null, pending: null, error: "" }, resourceVersion: 0, refresh() {}, submit: async () => {}, clearFailed() {} };
}
const disabledAction = (html, action) => new RegExp(`<fieldset disabled="" data-action="${action}"`).test(html);

test("account selection starts with a visible disabled campaign form; member reads remain available", () => {
  mockUi(); let view = mount(ui.NaverAccountPicker, { workspaceId: "900", userId: "u1", role: "viewer" }, true);
  assert.ok(disabledAction(view.html, "create_campaign")); assert.match(view.html, /조회 전용 권한/); view.unmount();
  view = mount(ui.NaverAccountManagement, { workspaceId: "900", userId: "u1", account, role: "viewer" }, true);
  assert.match(view.html, /모의 캠페인/); assert.ok(disabledAction(view.html, "create_campaign")); view.unmount();
});

test("no SITE channels blocks only adgroup creation, leaving campaign creation and paused budget edits enabled", () => {
  mockUi(); const view = mount(ui.NaverAccountManagement, { workspaceId: "900", userId: "u1", account, role: "owner" }, true);
  assert.equal(disabledAction(view.html, "create_campaign"), false);
  byId(view, "naver-manage-campaign").props.onChange(event("cmp-1")); view.render();
  assert.ok(disabledAction(view.html, "create_adgroup")); assert.equal(disabledAction(view.html, "budget_campaign"), false);
  assert.match(view.html, /SITE 비즈채널이 필요/); assert.match(view.html, /href="https:\/\/ads.naver.com"/); view.unmount();
});

test("active or unsupported parents remain readable while all dependent changes are disabled", () => {
  for (const c of [{ ...campaign, userLock: false }, { ...campaign, campaignType: "SHOPPING" }]) {
    mockUi(); const view = mount(ui.NaverCampaignManagement, { workspaceId: "900", accountId: "50", campaign: c, channels: [], enabled: true, submit: async () => {}, version: "0", channelsLoading: false }, true);
    assert.ok(disabledAction(view.html, "budget_campaign")); assert.ok(disabledAction(view.html, "create_adgroup")); assert.match(view.html, /모의 그룹/); view.unmount();
  }
  mockUi(); const view = mount(ui.NaverAdgroupManagement, { workspaceId: "900", accountId: "50", campaign, group: { ...group, userLock: false }, enabled: true, submit: async () => {}, version: "0" }, true);
  assert.ok(disabledAction(view.html, "bid_adgroup")); assert.ok(disabledAction(view.html, "create_keyword")); assert.match(view.html, /모의 키워드|200원|그룹 입찰가 사용/); view.unmount();
});

async function fixtureCall(handler, path, method = "GET", payload) {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]); req.url = path; req.method = method;
  let status, value; const res = { writeHead(code) { status = code; }, end(body) { value = JSON.parse(body); } };
  await handler(req, res); return { status, value };
}
test("memory-only fixture exercises all six operations, paused creations, replay journal and missing channels without a listening server", async () => {
  const handler = createNaverManagementFixtureHandler(), base = "/workspaces/900/integrations/naver/management";
  assert.equal((await fixtureCall(handler, "/auth/me")).value.id, "900");
  assert.equal((await fixtureCall(handler, "/workspaces")).value[0].role, "owner");
  let counter = 10;
  const mutate = async (action, payload) => {
    const input = { requestId: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`, accountId: "50", action, payload };
    const result = await fixtureCall(handler, `${base}/operations`, "POST", input);
    assert.equal(result.value.status, "succeeded");
    assert.deepEqual((await fixtureCall(handler, `${base}/operations`, "POST", input)).value, result.value);
    return result.value.result;
  };
  const c = await mutate("create_campaign", { name: "새 모의 캠페인", dailyBudget: "1000" });
  await mutate("budget_campaign", { ...c, dailyBudget: "2000" });
  const g = await mutate("create_adgroup", { ...c, name: "새 모의 그룹", bidAmt: "100", pcChannelId: "fixture-site-1", mobileChannelId: "fixture-site-1" });
  await mutate("bid_adgroup", { ...g, bidAmt: "200" });
  const k = await mutate("create_keyword", { ...g, keyword: "모의 단일 키워드", bidAmt: "100" });
  await mutate("bid_keyword", { ...k, bidAmt: "300" });
  const keywords = await fixtureCall(handler, `${base}/keywords?accountId=50&campaignId=${c.campaignId}&adgroupId=${g.adgroupId}`);
  assert.equal(keywords.value[0].userLock, true); assert.equal(keywords.value[0].bidAmt, "300");
  assert.equal((await fixtureCall(handler, `${base}/pending?accountId=50`)).value, null);
  await fixtureCall(handler, "/__test/state", "POST", { scenario: "no_channels" });
  assert.deepEqual((await fixtureCall(handler, `${base}/channels?accountId=50`)).value, []);
  await mutate("create_campaign", { name: "채널 없는 모의 캠페인", dailyBudget: "1000" });
});
