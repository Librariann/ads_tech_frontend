import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const transpile = (text) => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const metaUrl = dataUrl(transpile(await source("lib/integrations/meta.ts")));
const meta = await import(metaUrl);
const nextServer = pathToFileURL(require.resolve("next/server")).href;
const proxyStub = dataUrl("export const proxyAuthenticatedJson = (...args) => globalThis.__metaProxy(...args);");
const route = await import(dataUrl(transpile(await source("app/api/workspaces/[workspaceId]/integrations/meta/[...path]/route.ts"))
  .replaceAll('"next/server"', JSON.stringify(nextServer)).replaceAll('"@/lib/auth/proxy"', JSON.stringify(proxyStub))
  .replaceAll('"@/lib/integrations/meta"', JSON.stringify(metaUrl))));

const context = (path, workspaceId = "7") => ({ params: Promise.resolve({ path: path.split("/"), workspaceId }) });
const request = (path, { method = "GET", body, origin = "https://app.example", headers = {} } = {}) => new Request(`https://app.example/api/workspaces/7/integrations/meta/${path}`, {
  method, ...(body === undefined ? {} : { body }), headers: { ...(origin === null ? {} : { origin }), ...headers },
});
let forwarded;
function mockProxy(status = 200, payload = []) {
  forwarded = [];
  globalThis.__metaProxy = async (...args) => { forwarded.push(args); return Response.json(payload, { status }); };
}

test("Meta internal IDs are positive signed PG bigint strings; external IDs are digits only", () => {
  for (const id of ["1", "9223372036854775807"]) assert.equal(meta.isMetaId(id), true);
  for (const id of ["0", "01", "-1", "1\n", "9223372036854775808", "10000000000000000000", 1, null]) assert.equal(meta.isMetaId(id), false);
  assert.deepEqual(meta.metaAccountInput({ connectionId: "3", externalAccountId: "1234" }), { connectionId: "3", externalAccountId: "1234" });
  for (const value of [null, [], { connectionId: 3, externalAccountId: "1234" }, { connectionId: "3", externalAccountId: "act_1234" }, { connectionId: "3", externalAccountId: "1234", token: "secret" }]) assert.equal(meta.metaAccountInput(value), null);
  assert.equal(meta.isMetaAvailableAccounts([{ externalAccountId: "act_12", name: "A", currency: "USD", timezone: "UTC", accountStatus: 1 }]), false);
});

test("Meta report query requires an internal account, real paired dates, at most 92 inclusive days", () => {
  assert.equal(meta.metaReportQuery(new URLSearchParams("accountId=3")), "accountId=3");
  assert.equal(meta.metaReportQuery(new URLSearchParams("accountId=3&dateFrom=2026-01-01&dateTo=2026-04-02")), "accountId=3&dateFrom=2026-01-01&dateTo=2026-04-02");
  for (const query of ["", "accountId=all", "accountId=act_3", "accountId=3&accountId=4", "accountId=3&token=x", "accountId=3&dateFrom=2026-01-01", "accountId=3&dateFrom=&dateTo=", "accountId=3&dateFrom=2026-02-29&dateTo=2026-03-01", "accountId=3&dateFrom=2026-01-01&dateTo=2026-04-03", "accountId=3&dateFrom=2026-01-02&dateTo=2026-01-01", "accountId=3&dateFrom=2026-01-01&dateFrom=2026-01-01&dateTo=2026-01-02"]) assert.equal(meta.metaReportQuery(new URLSearchParams(query)), null, query);
});

test("spend is whole-currency decimal, rounded without precision loss; no budget conversion API", () => {
  assert.equal(meta.formatMetaMoney("123.45", "USD"), "USD 123.45");
  assert.equal(meta.formatMetaMoney("9007199254740993123.455", "USD"), "USD 9,007,199,254,740,993,123.46");
  assert.equal(meta.formatMetaMoney("0", "KRW"), "KRW 0");
  assert.equal(meta.formatMetaMoney("999.999", "USD"), "USD 1,000.00");
  assert.equal(meta.formatMetaMoney("12.3456", "KWD"), "KWD 12.346");
  for (const value of [null, "NaN", "1e4", "-1", "1\n"]) assert.equal(meta.formatMetaMoney(value, "USD"), "미제공");
  assert.equal(meta.formatMetaMoney("1", "not currency"), "미제공");
  assert.equal(meta.formatMetaMoney.length, 2);
  assert.equal(meta.formatMetaInteger("900719925474099312345"), "900,719,925,474,099,312,345");
  assert.equal(meta.formatMetaInteger(null), "미제공");
});

test("token expiry uses 60 second margin and safe config names include encryption key", () => {
  const now = Date.parse("2026-11-03T00:00:00Z");
  const connection = { status: "active", tokenExpiresAt: new Date(now + 60_000).toISOString() };
  assert.equal(meta.metaConnectionNeedsAuth(connection, now), true);
  assert.equal(meta.metaConnectionNeedsAuth({ ...connection, tokenExpiresAt: new Date(now + 60_001).toISOString() }, now), false);
  assert.equal(meta.metaConnectionNeedsAuth({ ...connection, status: "revoked", tokenExpiresAt: null }, now), true);
  assert.deepEqual(meta.safeMetaMissingNames(["META_APP_SECRET", "META_TOKEN_ENCRYPTION_KEY", "secret-value", "access_token=abc"]), ["META_APP_SECRET", "META_TOKEN_ENCRYPTION_KEY"]);
  assert.equal(meta.isMetaConfiguration({ configured: false, missing: ["META_TOKEN_ENCRYPTION_KEY"] }), true);
});

test("OAuth redirects accept only the Meta HTTPS authorization endpoint", () => {
  assert.ok(meta.metaAuthorizationUrl("https://www.facebook.com/v24.0/dialog/oauth?scope=ads_read"));
  for (const url of ["javascript:alert(1)", "http://facebook.com/dialog/oauth", "https://facebook.com.evil.test/dialog/oauth", "https://user:secret@facebook.com/dialog/oauth", "https://facebook.com:444/dialog/oauth", "https://facebook.com/not-oauth"]) assert.equal(meta.metaAuthorizationUrl(url), null);
});

test("BFF allows only read endpoints, OAuth and explicit account registration; every response no-store", async () => {
  mockProxy();
  for (const path of ["configuration", "connections", "accounts", "connections/3/available-accounts", "report?accountId=4"]) {
    const response = await route.GET(request(path), context(path.split("?")[0]));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const [target, init] = forwarded.at(-1);
    assert.equal(target, `/workspaces/7/integrations/meta/${path}`);
    assert.equal(init.cache, "no-store");
  }
  for (const path of ["campaigns", "oauth/start", "connections/9223372036854775808/available-accounts", "connections/3/token", "accounts/3"]) {
    const response = await route.GET(request(path), context(path));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(forwarded.length, 5);
  assert.equal((await route.GET(request("accounts"), context("accounts", "9223372036854775808"))).status, 404);
});

test("BFF rejects unknown and duplicate queries rather than forwarding them", async () => {
  mockProxy();
  for (const path of ["configuration?token=x", "accounts?connectionId=3", "report?accountId=3&access_token=x", "report?accountId=3&accountId=4", "report?accountId=3&dateTo=2026-11-03"]) assert.equal((await route.GET(request(path), context(path.split("?")[0]))).status, 400);
  assert.equal(forwarded.length, 0);
});

test("BFF POST requires exact same origin, rejects same-site sibling origins, non-JSON and writes", async () => {
  mockProxy();
  for (const options of [{ origin: null }, { origin: "https://other.example" }, { headers: { "sec-fetch-site": "same-site" } }, { headers: { "sec-fetch-site": "cross-site" } }]) assert.equal((await route.POST(request("oauth/start", { method: "POST", ...options }), context("oauth/start"))).status, 403);
  assert.equal((await route.POST(request("accounts", { method: "POST", body: "{}" }), context("accounts"))).status, 415);
  assert.equal((await route.POST(request("campaigns", { method: "POST" }), context("campaigns"))).status, 404);
  assert.equal(forwarded.length, 0);
});

test("BFF bounds streamed JSON, enforces exact account fields, and OAuth start forwards no body", async () => {
  mockProxy();
  const post = (path, body) => route.POST(request(path, { method: "POST", body, headers: { "content-type": "application/json" } }), context(path));
  for (const body of ["null", "[]", "{", '{"scope":"ads_management"}']) assert.equal((await post("oauth/start", body)).status, 400);
  assert.equal((await post("accounts", JSON.stringify({ connectionId: "3", externalAccountId: "act_1234" }))).status, 400);
  assert.equal((await post("accounts", JSON.stringify({ connectionId: "3", externalAccountId: "1234", platform: "meta_ads" }))).status, 400);
  assert.equal((await post("accounts", '"' + "x".repeat(4097) + '"')).status, 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4097)); controller.close(); } });
  const streamed = new Request("https://app.example/api/test", { method: "POST", body: stream, duplex: "half", headers: { origin: "https://app.example", "content-type": "application/json" } });
  assert.equal((await route.POST(streamed, context("accounts"))).status, 413);
  assert.equal((await post("oauth/start", "{}")).status, 200);
  assert.equal(forwarded.at(-1)[1].body, undefined);
  assert.equal((await route.POST(request("oauth/start", { method: "POST" }), context("oauth/start"))).status, 200);
  assert.equal((await post("accounts", JSON.stringify({ connectionId: "3", externalAccountId: "1234" }))).status, 200);
  assert.deepEqual(JSON.parse(forwarded.at(-1)[1].body), { connectionId: "3", externalAccountId: "1234" });
});

test("BFF retains safe actionable error codes but removes raw provider messages and secrets", async () => {
  for (const code of ["META_ADS_REAUTH_REQUIRED", "META_ADS_NOT_CONFIGURED", "META_ADS_PERMISSION_REQUIRED", "META_ADS_RATE_LIMITED", "ENTITLEMENT_LIMIT_EXCEEDED", "ACTIVE_SUBSCRIPTION_REQUIRED"]) {
    mockProxy(403, { code, message: "access_token=secret", token: "secret" });
    const response = await route.GET(request("accounts"), context("accounts"));
    const body = await response.text();
    assert.equal(JSON.parse(body).code, code);
    assert.doesNotMatch(body, /secret|access_token/);
  }
  mockProxy(502, { code: "secret_unknown_code", message: "secret" });
  assert.doesNotMatch(await (await route.GET(request("accounts"), context("accounts"))).text(), /secret/);
  assert.match(meta.metaErrorMessage(403, "ENTITLEMENT_LIMIT_EXCEEDED"), /한도/);
  assert.match(meta.metaErrorMessage(403, "ACTIVE_SUBSCRIPTION_REQUIRED"), /활성 구독/);
  assert.match(meta.metaErrorMessage(401, "META_ADS_REAUTH_REQUIRED"), /앱 로그인은 유지/);
  assert.match(meta.metaErrorMessage(401), /로그인 세션/);
});

const cookiesStub = dataUrl("export const cookies = async () => ({ get: (name) => globalThis.__metaAuth.cookies[name] ? { value: globalThis.__metaAuth.cookies[name] } : undefined });");
const authStub = dataUrl(`
  export const ACCESS_TOKEN_COOKIE = "access", REFRESH_TOKEN_COOKIE = "refresh";
  export class AuthBackendUnavailableError extends Error {}
  export const authBackendFetch = (...args) => globalThis.__metaAuth.fetch(...args);
  export const refreshAuthTokens = (...args) => globalThis.__metaAuth.refresh(...args);
  export const setAuthCookies = (response) => { response.headers.set("x-test-refreshed", "true"); };
  export const clearAuthCookies = (response) => { response.headers.set("x-test-cleared", "true"); };
`);
const authProxy = await import(dataUrl(transpile(await source("lib/auth/proxy.ts"))
  .replace('import "server-only";', "").replaceAll('"next/headers"', JSON.stringify(cookiesStub))
  .replaceAll('"next/server"', JSON.stringify(nextServer)).replaceAll('"@/lib/auth/server"', JSON.stringify(authStub))));

test("Meta provider 401 preserves session without refresh; genuine JWT 401 still refreshes", async () => {
  let refreshes = 0;
  globalThis.__metaAuth = { cookies: { access: "jwt", refresh: "refresh-jwt" }, fetch: async () => Response.json({ code: "META_ADS_REAUTH_REQUIRED" }, { status: 401 }), refresh: async () => { refreshes++; return null; } };
  let response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/meta/report");
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("x-test-cleared"), null);
  assert.equal(refreshes, 0);
  let attempts = 0;
  globalThis.__metaAuth.fetch = async () => ++attempts === 1 ? Response.json({ message: "invalid JWT" }, { status: 401 }) : Response.json([]);
  globalThis.__metaAuth.refresh = async () => { refreshes++; return { accessToken: "new-jwt", refreshToken: "new-refresh" }; };
  response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/meta/accounts");
  assert.equal(response.status, 200);
  assert.equal(refreshes, 1);
  assert.equal(response.headers.get("x-test-refreshed"), "true");
  globalThis.__metaAuth.fetch = async () => Response.json({}, { status: 401 });
  globalThis.__metaAuth.refresh = async () => null;
  response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/meta/accounts");
  assert.equal(response.headers.get("x-test-cleared"), "true");
});

test("provider reauth after a JWT refresh and existing Google reauth also preserve session", async () => {
  let calls = 0;
  globalThis.__metaAuth = { cookies: { access: "old", refresh: "refresh" }, fetch: async () => Response.json(++calls === 1 ? {} : { code: "META_ADS_REAUTH_REQUIRED" }, { status: 401 }), refresh: async () => ({ accessToken: "new", refreshToken: "new" }) };
  let response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/meta/report");
  assert.equal(response.headers.get("x-test-cleared"), null);
  assert.equal(response.headers.get("x-test-refreshed"), "true");
  globalThis.__metaAuth.fetch = async () => Response.json({ code: "GOOGLE_ADS_REAUTH_REQUIRED" }, { status: 401 });
  response = await authProxy.proxyAuthenticatedJson("/workspaces/7/integrations/google-ads/report");
  assert.equal(response.headers.get("x-test-cleared"), null);
});
