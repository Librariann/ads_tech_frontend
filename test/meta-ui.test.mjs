import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataUrl = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const metaUrl = dataUrl(transpile(await read("lib/integrations/meta.ts")));
const hooksUrl = dataUrl("export const useState = (...args) => globalThis.__metaHooks.state(...args); export const useEffect = (...args) => globalThis.__metaHooks.effect(...args); export const useRef = (...args) => globalThis.__metaHooks.ref(...args);");
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const linkUrl = dataUrl(`import { jsx } from ${JSON.stringify(jsxUrl)}; export default function Link(props) { return jsx("a", props); }`);
const routerUrl = dataUrl("export const useRouter = () => ({ push() {} });");
const stylesUrl = dataUrl("export default new Proxy({}, { get: (_, key) => key });");
async function loadComponent(path) {
  return import(dataUrl(transpile(await read(path))
    .replaceAll('"react/jsx-runtime"', JSON.stringify(jsxUrl)).replaceAll('"react"', JSON.stringify(hooksUrl))
    .replaceAll('"next/link"', JSON.stringify(linkUrl)).replaceAll('"next/navigation"', JSON.stringify(routerUrl))
    .replaceAll('"lucide-react"', JSON.stringify(pathToFileURL(require.resolve("lucide-react")).href))
    .replaceAll('"@/lib/integrations/meta"', JSON.stringify(metaUrl)).replaceAll('"./meta-report.module.css"', JSON.stringify(stylesUrl))));
}
const { MetaSection } = await loadComponent("components/integrations/meta-section.tsx");
const { MetaReportDashboard } = await loadComponent("components/dashboard/meta-report.tsx");

// A small hook boundary exercises actual component requests and state transitions without a browser or credentials.
function mount(Component, props) {
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
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
      }
    },
    render() {
      cursor = 0; dirty = false; globalThis.__metaHooks = harness;
      tree = Component(props); html = renderToStaticMarkup(tree);
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
  harness.render();
  return harness;
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}
const button = (harness, label) => find(harness.tree, (node) => node.type === "button" && renderToStaticMarkup(node).includes(label));
const workspace = { id: "7", name: "운영팀", role: "viewer", timezone: "Asia/Seoul", defaultCurrency: "USD" };
const connection = { id: "5", status: "active", tokenExpiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" };
const account = { id: "4", connectionId: "5", platform: "meta_ads", externalAccountId: "1234", name: "Meta 계정", currency: "USD", timezone: "Asia/Seoul", status: "active" };
const metrics = { spend: "123.45", impressions: "1000", clicks: "20", reach: null };
const report = { platform: "meta", account, dateFrom: "2026-11-01", dateTo: "2026-11-03", fetchedAt: "2026-11-03T00:00:00Z", totals: metrics, campaigns: [{ id: "789", name: "읽기 전용 캠페인", status: "PAUSED", effectiveStatus: "PAUSED", objective: "OUTCOME_TRAFFIC", dailyBudget: "999999", lifetimeBudget: "888888", metrics }] };

test("Meta managers see loading, while viewer and marketer cannot connect or register", async () => {
  const manager = mount(MetaSection, { workspaceId: "7", role: "admin" });
  assert.match(manager.html, /role="status"/);
  assert.match(manager.html, /연결 상태를 확인/);
  assert.equal(button(manager, "Meta 연결"), undefined);
  for (const role of ["viewer", "marketer"]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("should not fetch"); };
    const view = mount(MetaSection, { workspaceId: "7", role });
    await view.settle();
    assert.match(view.html, /관리 권한이 필요/);
    assert.match(view.html, /dashboard\/meta\?workspaceId=7/);
    assert.equal(button(view, "Meta 연결"), undefined);
    assert.equal(calls, 0);
    view.unmount();
  }
});

test("configured:false is a useful normal state with no follow-up API calls or leaked config values", async () => {
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(url); return Response.json({ configured: false, missing: ["META_APP_ID", "META_TOKEN_ENCRYPTION_KEY", "secret-value"] }); };
  const view = mount(MetaSection, { workspaceId: "7", role: "owner", callback: "connection_failed" });
  await view.settle();
  assert.match(view.html, /설정이 아직 준비되지/);
  assert.match(view.html, /META_TOKEN_ENCRYPTION_KEY/);
  assert.match(view.html, /Meta 인증을 완료하지 못/);
  assert.doesNotMatch(view.html, /secret-value|서버에 연결할 수 없/);
  assert.equal(calls.length, 1);
  assert.equal(button(view, "Meta 연결"), undefined);
  view.unmount();
});

test("inactive accessible accounts remain explicitly selectable for historical read-only registration", async () => {
  const posts = [];
  globalThis.fetch = async (url, init) => {
    if (init.method === "POST") { posts.push([url, JSON.parse(init.body)]); return Response.json(account); }
    if (url.endsWith("/configuration")) return Response.json({ configured: true, missing: [] });
    if (url.endsWith("/connections")) return Response.json([connection]);
    if (url.endsWith("/available-accounts")) return Response.json([{ externalAccountId: "1234", name: "이전 계정", currency: "USD", timezone: "UTC", accountStatus: 2 }]);
    return Response.json([]);
  };
  const view = mount(MetaSection, { workspaceId: "7", role: "admin" });
  await view.settle();
  assert.match(view.html, /비활성 \(2\) · 과거 성과 조회/);
  const select = find(view.tree, (node) => node.type === "select" && node.props.value === "");
  select.props.onChange({ target: { value: "1234" } }); view.render();
  assert.equal(button(view, "선택 계정 등록").props.disabled, false);
  await button(view, "선택 계정 등록").props.onClick();
  assert.deepEqual(posts[0][1], { connectionId: "5", externalAccountId: "1234" });
  assert.equal(posts.length, 1);
  await view.settle(); view.unmount();
});

test("report works for viewer, excludes disconnected registrations, and never displays budget or conversion metrics", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith("/configuration")) return Response.json({ configured: true, missing: [] });
    if (url.endsWith("/accounts")) return Response.json([{ ...account, id: "3", status: "disconnected" }, account]);
    return Response.json(report);
  };
  const view = mount(MetaReportDashboard, { workspace, workspaces: [workspace] });
  assert.match(view.html, /불러오고 있습니다/);
  await view.settle();
  assert.match(calls.at(-1)[0], /report\?accountId=4$/);
  assert.equal(calls.every(([, init]) => init.cache === "no-store"), true);
  assert.match(view.html, /USD 123.45/);
  assert.match(view.html, /읽기 전용 캠페인/);
  assert.match(view.html, /미제공/);
  assert.doesNotMatch(view.html, /일일 예산|전체 기간 예산|999999|888888|ROAS|전환/);
  view.unmount();
});

test("report unconfigured, no active accounts, and provider permission errors do not become fake zero totals", async () => {
  for (const scenario of ["unconfigured", "disconnected", "permission"]) {
    globalThis.fetch = async (url) => {
      if (url.endsWith("/configuration")) return Response.json({ configured: scenario !== "unconfigured", missing: ["META_TOKEN_ENCRYPTION_KEY"] });
      if (url.endsWith("/accounts")) return Response.json([{ ...account, status: scenario === "disconnected" ? "disconnected" : "active" }]);
      return Response.json({ code: "META_ADS_PERMISSION_REQUIRED", message: "raw-secret" }, { status: 403 });
    };
    const view = mount(MetaReportDashboard, { workspace, workspaces: [workspace] });
    await view.settle();
    assert.match(view.html, scenario === "unconfigured" ? /설정이 아직 준비되지/ : scenario === "disconnected" ? /등록된 Meta 광고계정이 없습니다/ : /Meta 조회 권한이 없습니다/);
    assert.doesNotMatch(view.html, /USD 0|raw-secret|<dl/);
    view.unmount();
  }
});

test("late OAuth completion after workspace unmount cannot redirect", async () => {
  let finish;
  globalThis.fetch = async (url, init) => {
    if (init.method === "POST") return new Promise((resolve) => { finish = resolve; });
    if (url.endsWith("/configuration")) return Response.json({ configured: true, missing: [] });
    return Response.json([]);
  };
  let redirects = 0;
  globalThis.window = { location: { assign() { redirects++; } } };
  const view = mount(MetaSection, { workspaceId: "7", role: "admin" });
  await view.settle();
  const pending = button(view, "Meta 연결").props.onClick();
  view.unmount();
  finish(Response.json({ authorizationUrl: "https://www.facebook.com/v24.0/dialog/oauth?scope=ads_read" }));
  await pending;
  assert.equal(redirects, 0);
  delete globalThis.window;
});

test("advertising entry forwards Meta OAuth failure; section and report are keyed to workspace", async () => {
  const entry = await read("app/advertising/page.tsx");
  assert.match(entry, /platform=meta&meta=connection_failed/);
  const advertising = await read("app/workspaces/[workspaceId]/advertising/page.tsx");
  assert.match(advertising, /MetaSection key=\{workspaceId\}/);
  assert.match(advertising, /query\.platform === "meta"/);
  assert.match(await read("app/dashboard/meta/page.tsx"), /MetaReportDashboard key=\{workspace.id\}/);
});
