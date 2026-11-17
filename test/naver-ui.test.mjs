import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const naverUrl = dataUrl(transpile(await read("lib/integrations/naver.ts")));
const hooksUrl = dataUrl("export const useState = (...args) => globalThis.__naverHooks.state(...args); export const useEffect = (...args) => globalThis.__naverHooks.effect(...args); export const useRef = (...args) => globalThis.__naverHooks.ref(...args);");
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const linkUrl = dataUrl(`import { jsx } from ${JSON.stringify(jsxUrl)}; export default function Link(props) { return jsx("a", props); }`);
const { NaverSection } = await import(dataUrl(transpile(await read("components/integrations/naver-section.tsx"))
  .replaceAll('"react/jsx-runtime"', JSON.stringify(jsxUrl)).replaceAll('"react"', JSON.stringify(hooksUrl))
  .replaceAll('"next/link"', JSON.stringify(linkUrl)).replaceAll('"lucide-react"', JSON.stringify(pathToFileURL(require.resolve("lucide-react")).href))
  .replaceAll('"@/lib/integrations/naver"', JSON.stringify(naverUrl))));

// Same hook-boundary approach as Meta tests; no browser, server, or real credentials.
function mount(role = "owner") {
  const slots = [], effects = [];
  let cursor = 0, dirty = true, tree, html;
  const harness = {
    state(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; dirty = true; }];
    },
    ref(initial) { const [ref] = harness.state(() => ({ current: initial })); return ref; },
    effect(callback, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects.push(() => {
        previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() };
      });
    },
    render() {
      cursor = 0; dirty = false; globalThis.__naverHooks = harness;
      tree = NaverSection({ workspaceId: "7", role }); html = renderToStaticMarkup(tree);
      return html;
    },
    async settle() {
      for (let i = 0; i < 12; i++) {
        if (dirty) harness.render();
        effects.splice(0).forEach((effect) => effect());
        await setImmediate();
      }
      if (dirty) harness.render();
      return html;
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    get tree() { return tree; }, get html() { return html; },
  };
  harness.render(); return harness;
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
const element = (view, id) => find(view.tree, (node) => node.props?.id === id);
const button = (view, label) => find(view.tree, (node) => node.type === "button" && renderToStaticMarkup(node).includes(label));
const registrationForm = (view) => find(view.tree, (node) => node.type === "form" && node.props.method === "post");
const reportForm = (view) => find(view.tree, (node) => node.type === "form" && !node.props.method);
const account = { id: "4", connectionId: "5", platform: "naver_ads", externalAccountId: "1234", name: "모의 검색광고 계정", currency: "KRW", timezone: "Asia/Seoul", status: "active", connectionStatus: "active" };
const report = { account, period: { dateFrom: "2024-01-01", dateTo: "2024-01-30" }, campaigns: [
  { id: "cmp-1", name: "모의 캠페인", status: "PAUSED", campaignType: "WEB_SITE", dailyBudget: "10000", impressions: null, clicks: "0", cost: null },
], totals: { impressions: null, clicks: "0", cost: null }, fetchedAt: "2024-01-31T00:00:00Z" };
function mockFetch({ accounts = [account], configured = true, onReport = () => Response.json(report), onPost = () => Response.json({ registered: true }) } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    if (init.method === "POST") return onPost(url, init);
    if (url.endsWith("/configuration")) return Response.json({ configured });
    if (url.endsWith("/accounts")) return Response.json(accounts);
    return onReport(url, init);
  };
  return calls;
}
const input = { customerId: "1234", name: "모의 계정", apiKey: "fictional-api-key", secretKey: "fictional-secret-key" };
function submitRegistration(view, onReset = () => {}) {
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class { get(name) { return input[name]; } };
  try { return registrationForm(view).props.onSubmit({ preventDefault() {}, currentTarget: { reset: onReset } }); }
  finally { globalThis.FormData = OriginalFormData; }
}

test("initial loading, unconfigured, empty and safe error states do not fabricate accounts or stats", async () => {
  let calls = mockFetch({ configured: false });
  let view = mount();
  assert.match(view.html, /연결 상태를 확인/);
  await view.settle();
  assert.match(view.html, /설정이 아직 준비되지/);
  assert.equal(calls.length, 1);
  assert.equal(registrationForm(view), undefined); view.unmount();
  calls = mockFetch({ accounts: [] }); view = mount(); await view.settle();
  assert.match(view.html, /등록된 네이버 검색광고 계정이 없습니다/);
  assert.doesNotMatch(view.html, /조회된 캠페인 합계|0원|잔액/);
  assert.equal(calls.length, 2); view.unmount();
  globalThis.fetch = async () => Response.json({ message: "private-secret", code: "NAVER_ADS_UNAVAILABLE" }, { status: 503 });
  view = mount(); await view.settle();
  assert.match(view.html, /일시적으로 연결할 수 없습니다/);
  assert.doesNotMatch(view.html, /private-secret/);
  assert.equal(button(view, "상태 다시 확인").props.disabled, false); view.unmount();
});

test("owner/admin credentials stay masked and autocomplete off; viewer/marketer can only read", async () => {
  for (const role of ["owner", "admin", "viewer", "marketer"]) {
    const calls = mockFetch(); const view = mount(role); await view.settle();
    assert.match(view.html, /모의 캠페인/);
    assert.equal(calls.every(([, init]) => init.cache === "no-store" && init.credentials === "same-origin"), true);
    if (role === "owner" || role === "admin") {
      assert.match(view.html, /API 키 \(액세스 라이선스\)/);
      assert.match(view.html, /네이버 검색광고 고객 ID \(Customer ID\)/);
      assert.equal(element(view, "naver-customer-id").props.pattern, "[1-9][0-9]{0,14}");
      for (const id of ["naver-api-key", "naver-secret-key"]) {
        const field = element(view, id);
        assert.equal(field.props.type, "password");
        assert.equal(field.props.autoComplete, "off");
        assert.equal(field.props.value, undefined);
      }
    } else {
      assert.equal(registrationForm(view), undefined);
      assert.equal(button(view, "계정 등록"), undefined);
      assert.match(view.html, /소유자 또는 관리자에게 요청/);
      assert.equal(calls.some(([, init]) => init.method === "POST"), false);
    }
    view.unmount();
  }
});

test("registration sends exact fields once, clears the form on success, reloads accounts without retaining keys", async () => {
  let finish;
  const calls = mockFetch({ accounts: [], onPost: () => new Promise((resolve) => { finish = resolve; }) });
  const view = mount(); await view.settle();
  let resets = 0;
  const pending = submitRegistration(view, () => resets++);
  await submitRegistration(view);
  view.render();
  assert.equal(button(view, "계정 등록").props.disabled, true);
  assert.equal(calls.filter(([, init]) => init.method === "POST").length, 1);
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), input);
  assert.doesNotMatch(view.html, /fictional-api-key|fictional-secret-key/);
  finish(Response.json({ registered: true })); await pending; await view.settle();
  assert.equal(resets, 1);
  assert.match(view.html, /계정을 등록했습니다/);
  assert.equal(calls.filter(([url]) => url.endsWith("/accounts")).length, 3);
  view.unmount();
});

test("failed registration keeps safe actionable errors; unmounted registration aborts without success/reset", async () => {
  mockFetch({ accounts: [], onPost: () => Response.json({ code: "ENTITLEMENT_LIMIT_EXCEEDED", message: "private" }, { status: 403 }) });
  let view = mount(); await view.settle();
  let resets = 0;
  await submitRegistration(view, () => resets++); await view.settle();
  assert.match(view.html, /한도에 도달/);
  assert.doesNotMatch(view.html, /private|계정을 등록했습니다/);
  assert.equal(resets, 0); view.unmount();
  let finish, signal;
  mockFetch({ accounts: [], onPost: (_, init) => { signal = init.signal; return new Promise((resolve) => { finish = resolve; }); } });
  view = mount(); await view.settle();
  const pending = submitRegistration(view, () => resets++); view.unmount();
  assert.equal(signal.aborted, true);
  finish(Response.json({ registered: true })); await pending;
  assert.equal(resets, 0);
});

test("report shows nullable totals as dashes and VAT-inclusive KRW unscaled; no fabricated performance", async () => {
  mockFetch(); let view = mount("viewer"); await view.settle();
  assert.match(view.html, /조회된 캠페인 합계/);
  assert.match(view.html, /광고비 \(VAT 포함\)/);
  assert.match(view.html, /한국 시간/);
  assert.match(view.html, /10,000원/);
  assert.match(view.html, /<dd[^>]*>-<\/dd>/);
  assert.doesNotMatch(view.html, /잔액|ROAS|전환|>0원</); view.unmount();
  mockFetch({ onReport: () => Response.json({ ...report, campaigns: [], totals: { impressions: "0", clicks: "0", cost: "0" } }) });
  view = mount(); await view.settle();
  assert.match(view.html, /조회된 캠페인이 없습니다/);
  assert.match(view.html, /0원/);
  assert.doesNotMatch(view.html, /<table/); view.unmount();
});

test("explicit dates are validated before fetch and default recent-30-day queries omit dates", async () => {
  const calls = mockFetch({ onReport: (url) => {
    const query = new URL(url, "https://app.example").searchParams;
    return Response.json({ ...report, period: { dateFrom: query.get("dateFrom") ?? report.period.dateFrom, dateTo: query.get("dateTo") ?? report.period.dateTo } });
  } });
  const view = mount(); await view.settle();
  assert.match(calls.at(-1)[0], /report\?accountId=4$/);
  const change = (id, value) => { element(view, id).props.onChange({ target: { value } }); view.render(); };
  change("naver-date-from", "2024-01-01"); change("naver-date-to", "2024-02-01");
  reportForm(view).props.onSubmit({ preventDefault() {} }); await view.settle();
  assert.match(view.html, /최대 31일/); assert.equal(calls.length, 3);
  change("naver-date-to", "2024-01-31"); reportForm(view).props.onSubmit({ preventDefault() {} }); await view.settle();
  assert.match(calls.at(-1)[0], /dateFrom=2024-01-01&dateTo=2024-01-31/);
  change("naver-date-from", "2999-01-01"); change("naver-date-to", "2999-01-01");
  reportForm(view).props.onSubmit({ preventDefault() {} }); await view.settle();
  assert.match(view.html, /오늘 이후/); assert.equal(calls.length, 4);
  button(view, "최근 30일").props.onClick(); await view.settle();
  assert.match(calls.at(-1)[0], /report\?accountId=4$/); view.unmount();
});

test("account switches hide old data and ignore aborted late reports; report errors support retry", async () => {
  let finish, oldSignal;
  const second = { ...account, id: "6", externalAccountId: "5678", name: "다른 계정" };
  mockFetch({ accounts: [account, second], onReport: (url, init) => {
    if (url.endsWith("accountId=4")) { oldSignal = init.signal; return new Promise((resolve) => { finish = resolve; }); }
    return Response.json({ ...report, account: second, campaigns: [{ ...report.campaigns[0], name: "다른 계정 캠페인" }] });
  } });
  let view = mount(); await view.settle();
  element(view, "naver-report-account").props.onChange({ target: { value: "6" } }); view.render();
  assert.doesNotMatch(view.html, /조회된 캠페인 합계/);
  await view.settle(); assert.equal(oldSignal.aborted, true);
  assert.match(view.html, /다른 계정 캠페인/);
  finish(Response.json(report)); await view.settle();
  assert.doesNotMatch(view.html, /모의 캠페인/); view.unmount();
  let attempts = 0;
  mockFetch({ onReport: () => ++attempts === 1 ? Response.json({ code: "NAVER_ADS_RATE_LIMITED", message: "private" }, { status: 429 }) : Response.json(report) });
  view = mount(); await view.settle();
  assert.match(view.html, /조회 요청이 많습니다/);
  assert.doesNotMatch(view.html, /private|조회된 캠페인 합계/);
  reportForm(view).props.onSubmit({ preventDefault() {} }); await view.settle();
  assert.match(view.html, /모의 캠페인/); view.unmount();
});

test("NAVER navigation stays on the existing advertising page and code has no client storage, logging, or provider writes", async () => {
  const page = await read("app/workspaces/[workspaceId]/advertising/page.tsx");
  assert.match(page, /query\.platform === "naver"/);
  assert.match(page, /NaverSection key=\{workspaceId\}/);
  assert.match(page, /advertising\?platform=naver/);
  const entry = await read("app/advertising/page.tsx");
  assert.match(entry, /query\.platform === "naver"/);
  const source = await read("components/integrations/naver-section.tsx") + await read("lib/integrations/naver.ts");
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|navigator\.sendBeacon|api\.searchad\.naver\.com/);
  assert.doesNotMatch(source, /method:\s*["'](?:PUT|PATCH|DELETE)["']/);
});
