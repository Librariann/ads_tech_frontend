import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const naverUrl = dataUrl(transpile(await read("lib/integrations/naver.ts")));
const naver = await import(naverUrl);
const nextServer = pathToFileURL(require.resolve("next/server")).href;
const proxyStub = dataUrl("export const proxyAuthenticatedJson = (...args) => globalThis.__naverProxy(...args);");
const route = await import(dataUrl(transpile(await read("app/api/workspaces/[workspaceId]/integrations/naver/[...path]/route.ts"))
  .replaceAll('"next/server"', JSON.stringify(nextServer)).replaceAll('"@/lib/auth/proxy"', JSON.stringify(proxyStub))
  .replaceAll('"@/lib/integrations/naver"', JSON.stringify(naverUrl))));
const context = (path, workspaceId = "7") => ({ params: Promise.resolve({ path: path.split("/"), workspaceId }) });
const request = (path, { method = "GET", body, origin = "https://app.example", headers = {} } = {}) => new Request(`https://app.example/api/workspaces/7/integrations/naver/${path}`, {
  method, ...(body === undefined ? {} : { body }), headers: { ...(origin === null ? {} : { origin }), ...headers },
});
const input = { customerId: "1234", name: "검색광고", apiKey: "test-api-key", secretKey: "test-secret-key" };
const account = { id: "4", connectionId: "5", platform: "naver_ads", externalAccountId: "1234", name: "검색광고", currency: "KRW", timezone: "Asia/Seoul", status: "active", connectionStatus: "active" };
const report = { account, period: { dateFrom: "2024-01-01", dateTo: "2024-01-31" }, campaigns: [
  { id: "cmp-1", name: "검색", status: "PAUSED", campaignType: "WEB_SITE", dailyBudget: "10000", impressions: null, clicks: "0", cost: null },
], totals: { impressions: null, clicks: "0", cost: null }, fetchedAt: "2024-02-01T00:00:00Z" };
let forwarded;
function mockProxy(payload = [], status = 200, headers) {
  forwarded = [];
  globalThis.__naverProxy = async (...args) => { forwarded.push(args); return Response.json(payload, { status, headers }); };
}
const post = (body, options = {}) => route.POST(request("accounts", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" }, ...options,
}), context("accounts"));

test("NAVER internal bigint IDs and external Customer IDs remain separate strings", () => {
  for (const id of ["1", "9223372036854775807"]) assert.equal(naver.isNaverId(id), true);
  for (const id of ["0", "01", "-1", "1\n", "1 ", "9223372036854775808", 1, null]) assert.equal(naver.isNaverId(id), false);
  assert.deepEqual(naver.naverAccountInput(input), input);
  assert.ok(naver.naverAccountInput({ ...input, customerId: "9".repeat(15), name: "가".repeat(160), apiKey: "~".repeat(512), secretKey: "!".repeat(512) }));
  for (const value of [null, [], {}, { ...input, token: "x" }, { ...input, customerId: 1234 }, { ...input, customerId: "0" }, { ...input, customerId: "001234" }, { ...input, customerId: "1".repeat(16) }, { ...input, customerId: "1\n" }, { ...input, name: " " }, { ...input, name: "a".repeat(161) }]) assert.equal(naver.naverAccountInput(value), null);
  for (const credential of ["", "a b", "a\n", "a\t", "한글", "\x7f", "x".repeat(513)]) {
    assert.equal(naver.naverAccountInput({ ...input, apiKey: credential }), null);
    assert.equal(naver.naverAccountInput({ ...input, secretKey: credential }), null);
  }
});

test("report queries permit backend defaults or paired real dates, 31 inclusive days, no future KST dates", () => {
  assert.equal(naver.naverReportQuery(new URLSearchParams("accountId=4")), "accountId=4");
  assert.equal(naver.naverReportQuery(new URLSearchParams("accountId=4&dateFrom=2024-01-01&dateTo=2024-01-31")), "accountId=4&dateFrom=2024-01-01&dateTo=2024-01-31");
  for (const query of ["", "accountId=all", "accountId=0", "accountId=04", "accountId=9223372036854775808", "accountId=4&accountId=5", "accountId=4&token=x", "accountId=4&dateFrom=2024-01-01", "accountId=4&dateFrom=&dateTo=", "accountId=4&dateFrom=2023-02-29&dateTo=2023-03-01", "accountId=4&dateFrom=2024-01-01&dateTo=2024-02-01", "accountId=4&dateFrom=2024-01-02&dateTo=2024-01-01", "accountId=4&dateFrom=2999-01-01&dateTo=2999-01-01", "accountId=4&dateFrom=2024-01-01&dateTo=2024-01-01&dateTo=2024-01-01"]) assert.equal(naver.naverReportQuery(new URLSearchParams(query)), null, query);
  const midnightKst = Date.parse("2026-11-03T15:00:00Z");
  assert.equal(naver.naverToday(midnightKst - 1), "2026-11-03");
  assert.equal(naver.naverToday(midnightKst), "2026-11-04");
  assert.equal(naver.naverDateError("2026-11-04", "2026-11-04", midnightKst), null);
  assert.match(naver.naverDateError("2026-11-04", "2026-11-05", midnightKst), /오늘 이후/);
});

test("public parsers strip extra fields and preserve nullable campaign metrics and nullable totals", () => {
  assert.deepEqual(naver.parseNaverConfiguration({ configured: false, secretKey: "private" }), { configured: false });
  assert.deepEqual(naver.parseNaverAccounts([{ ...account, apiKey: "private", secretKey: "private" }]), [account]);
  const parsed = naver.parseNaverReport({ ...report, secretKey: "private" });
  assert.deepEqual(parsed.totals, { impressions: null, clicks: "0", cost: null });
  assert.equal(parsed.campaigns[0].impressions, null);
  assert.doesNotMatch(JSON.stringify(parsed), /private|connectionId|connectionStatus/);
  const empty = { ...report, campaigns: [], totals: { impressions: "0", clicks: "0", cost: "0" } };
  assert.deepEqual(naver.parseNaverReport(empty).totals, empty.totals);
  for (const value of [null, {}, { ...report, totals: { impressions: 0, clicks: "0", cost: "0" } }, { ...report, totals: { impressions: "1", clicks: "0" } }, { ...report, campaigns: [{ ...report.campaigns[0], cost: "1e9" }] }, { ...report, account: { ...account, currency: "USD" } }, { ...report, period: { dateFrom: "", dateTo: "" } }]) assert.equal(naver.parseNaverReport(value), null);
  assert.equal(naver.parseNaverAccounts([{ ...account, id: 4 }]), null);
});

test("KRW VAT-inclusive amounts are not micros or floating point, missing is a dash and real zero is zero", () => {
  assert.equal(naver.formatNaverMoney("1234567"), "1,234,567원");
  assert.equal(naver.formatNaverMoney("9007199254740993123.45"), "9,007,199,254,740,993,123.45원");
  assert.equal(naver.formatNaverInteger("900719925474099312345"), "900,719,925,474,099,312,345");
  assert.equal(naver.formatNaverMoney("0"), "0원");
  assert.equal(naver.formatNaverInteger("0"), "0");
  for (const value of [null, "NaN", "1e6", "-1", "1\n"]) {
    assert.equal(naver.formatNaverMoney(value), "-");
    assert.equal(naver.formatNaverInteger(value), "-");
  }
});

test("BFF only allows configuration/accounts/report GET and account-registration POST, never NAVER writes", async () => {
  for (const [path, payload] of [["configuration", { configured: true }], ["accounts", [account]], ["report?accountId=4", report]]) {
    mockProxy(payload);
    const response = await route.GET(request(path), context(path.split("?")[0]));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(forwarded[0][0], `/workspaces/7/integrations/naver/${path}`);
    assert.equal(forwarded[0][1].cache, "no-store");
  }
  mockProxy();
  for (const path of ["campaigns", "ncc/campaigns", "oauth/start", "accounts/4", "connections", "report/extra", "accounts/"]) {
    assert.equal((await route.GET(request(path), context(path))).status, 404);
    assert.equal((await route.POST(request(path, { method: "POST" }), context(path))).status, 404);
  }
  assert.equal((await route.POST(request("report?accountId=4", { method: "POST" }), context("report"))).status, 404);
  for (const id of ["0", "01", "9223372036854775808", "7\n"]) assert.equal((await route.GET(request("accounts"), context("accounts", id))).status, 404);
  for (const path of ["accounts?apiKey=x", "configuration?x=y", "report?accountId=4&accountId=5", "report?accountId=4&dateTo=2024-01-01"]) assert.equal((await route.GET(request(path), context(path.split("?")[0]))).status, 400);
  assert.equal(forwarded.length, 0);
  assert.equal(route.PATCH, undefined);
  assert.equal(route.DELETE, undefined);
});

test("POST requires exact same origin and JSON, rejects extra fields, bounds actual streamed bytes to 4KiB", async () => {
  mockProxy();
  for (const options of [{ origin: null }, { origin: "https://other.example" }, { headers: { "content-type": "application/json", "sec-fetch-site": "same-site" } }, { headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" } }]) assert.equal((await post(input, options)).status, 403);
  for (const type of ["text/plain", "application/x-www-form-urlencoded", ""]) assert.equal((await post(input, { headers: { "content-type": type } })).status, 415);
  for (const payload of ["null", "[]", "{", JSON.stringify({ ...input, accessToken: "private" }), JSON.stringify({ ...input, secretKey: "with space" })]) assert.equal((await post(payload)).status, 400);
  assert.equal((await post(" ".repeat(4097))).status, 413);
  assert.equal((await post(input, { headers: { "content-type": "application/json", "content-length": "4097" } })).status, 413);
  const streamed = (chunks, headers = {}) => new Request("https://app.example/api/test", {
    method: "POST", duplex: "half", body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }),
    headers: { origin: "https://app.example", "content-type": "application/json", ...headers },
  });
  assert.equal((await route.POST(streamed([new Uint8Array(2048), new Uint8Array(2049)], { "content-length": "1" }), context("accounts"))).status, 413);
  assert.equal((await route.POST(streamed([new Uint8Array([0xff])]), context("accounts"))).status, 400);
  assert.equal(forwarded.length, 0);
  const body = JSON.stringify(input);
  const bounded = body + " ".repeat(4096 - Buffer.byteLength(body));
  assert.equal((await post(bounded)).status, 200);
  assert.deepEqual(JSON.parse(forwarded[0][1].body), input);
});

test("BFF redacts all upstream errors and registration responses while preserving multiple auth cookies", async () => {
  const headers = new Headers();
  headers.append("Set-Cookie", "access=refreshed; HttpOnly; Path=/");
  headers.append("Set-Cookie", "refresh=refreshed; HttpOnly; Path=/");
  headers.set("x-provider-token", "private");
  for (const code of [...naver.NAVER_SAFE_ERROR_CODES, "unknown-private-code"]) {
    mockProxy({ code, message: "private-secret", apiKey: "private" }, 401, headers);
    const response = await route.GET(request("accounts"), context("accounts"));
    const body = await response.text();
    assert.equal(response.status, 401);
    assert.doesNotMatch(body, /private/);
    assert.equal(JSON.parse(body).code, code.startsWith("unknown") ? undefined : code);
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal(response.headers.get("x-provider-token"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  mockProxy({ ...input, accessToken: "private" }, 201, headers);
  const registered = await post(input);
  assert.deepEqual(await registered.json(), { registered: true });
  assert.equal(registered.headers.getSetCookie().length, 2);
  mockProxy([{ ...account, apiKey: "private", secretKey: "private" }]);
  assert.deepEqual(await (await route.GET(request("accounts"), context("accounts"))).json(), [account]);
  mockProxy({ private: "bad-shape" }, 200, headers);
  const malformed = await route.GET(request("accounts"), context("accounts"));
  assert.equal(malformed.status, 502);
  assert.equal(malformed.headers.getSetCookie().length, 2);
  assert.doesNotMatch(await malformed.text(), /bad-shape/);
  globalThis.__naverProxy = async () => { throw new Error("private"); };
  const unavailable = await route.GET(request("accounts"), context("accounts"));
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private/);
});

const cookiesStub = dataUrl("export const cookies = async () => ({ get: (name) => globalThis.__naverAuth.cookies[name] ? { value: globalThis.__naverAuth.cookies[name] } : undefined });");
const authStub = dataUrl(`
  export const ACCESS_TOKEN_COOKIE = "access", REFRESH_TOKEN_COOKIE = "refresh";
  export class AuthBackendUnavailableError extends Error {}
  export const authBackendFetch = (...args) => globalThis.__naverAuth.fetch(...args);
  export const refreshAuthTokens = (...args) => globalThis.__naverAuth.refresh(...args);
  export const setAuthCookies = (response) => response.headers.append("Set-Cookie", "access=new; HttpOnly");
  export const clearAuthCookies = (response) => response.headers.append("Set-Cookie", "access=; Max-Age=0");
`);
const authProxy = await import(dataUrl(transpile(await read("lib/auth/proxy.ts"))
  .replace('import "server-only";', "").replaceAll('"next/headers"', JSON.stringify(cookiesStub))
  .replaceAll('"next/server"', JSON.stringify(nextServer)).replaceAll('"@/lib/auth/server"', JSON.stringify(authStub))));

test("NAVER provider auth failure preserves app login; genuine JWT 401 refreshes or clears cookies", async () => {
  let refreshes = 0;
  globalThis.__naverAuth = {
    cookies: { access: "jwt", refresh: "refresh" },
    fetch: async () => Response.json({ code: "NAVER_ADS_AUTH_FAILED" }, { status: 401 }),
    refresh: async () => { refreshes++; return null; },
  };
  let response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/naver/report");
  assert.equal(response.status, 401);
  assert.equal(refreshes, 0);
  assert.equal(response.headers.getSetCookie().length, 0);
  let calls = 0;
  globalThis.__naverAuth.fetch = async () => Response.json(++calls === 1 ? {} : { code: "NAVER_ADS_AUTH_FAILED" }, { status: 401 });
  globalThis.__naverAuth.refresh = async () => { refreshes++; return { accessToken: "new", refreshToken: "new" }; };
  response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/naver/report");
  assert.equal(refreshes, 1);
  assert.equal(response.headers.getSetCookie().some((c) => c.includes("Max-Age=0")), false);
  globalThis.__naverAuth.fetch = async () => Response.json({}, { status: 401 });
  globalThis.__naverAuth.refresh = async () => null;
  response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/naver/accounts");
  assert.match(response.headers.getSetCookie()[0], /Max-Age=0/);
  assert.match(naver.naverErrorMessage(401, "NAVER_ADS_AUTH_FAILED"), /앱 로그인은 유지/);
  assert.match(naver.naverErrorMessage(401), /로그인 세션/);
  assert.match(naver.naverErrorMessage(403, "ENTITLEMENT_LIMIT_EXCEEDED"), /한도/);
  assert.match(naver.naverErrorMessage(403, "ACTIVE_SUBSCRIPTION_REQUIRED"), /활성 구독/);
});
