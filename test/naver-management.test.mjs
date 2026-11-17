import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataUrl = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const transpile = (s) => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const naverUrl = dataUrl(transpile(await read("lib/integrations/naver.ts")));
const managementUrl = dataUrl(transpile(await read("lib/integrations/naver-management.ts")).replaceAll('"@/lib/integrations/naver"', JSON.stringify(naverUrl)));
const management = await import(managementUrl);
const journal = await import(dataUrl(transpile(await read("lib/integrations/naver-management-journal.ts")).replaceAll('"@/lib/integrations/naver-management"', JSON.stringify(managementUrl))));
const route = await import(dataUrl(transpile(await read("app/api/workspaces/[workspaceId]/integrations/naver/management/[...path]/route.ts"))
  .replaceAll('"next/server"', JSON.stringify(pathToFileURL(require.resolve("next/server")).href))
  .replaceAll('"@/lib/auth/proxy"', JSON.stringify(dataUrl("export const proxyAuthenticatedJson = (...args) => globalThis.__naverManagementProxy(...args);")))
  .replaceAll('"@/lib/integrations/naver"', JSON.stringify(naverUrl))
  .replaceAll('"@/lib/integrations/naver-management"', JSON.stringify(managementUrl))));
const requestId = "0fa2e590-1234-4567-8901-123456789abc";
const secondId = "0fa2e590-1234-4567-8901-123456789abd";
const intent = { requestId, accountId: "23", action: "create_campaign" };
const input = { ...intent, payload: { name: "검색 캠페인", dailyBudget: "1000" } };
const op = (status = "pending", extra = {}) => ({ ...intent, status, result: status === "succeeded" ? { campaignId: "cmp-1" } : null, errorCode: null, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:01Z", ...extra });
const campaign = { id: "cmp-1", name: "검색 캠페인", status: "PAUSED", campaignType: "WEB_SITE", userLock: true, dailyBudget: "1000" };
const group = { id: "grp-1", campaignId: "cmp-1", name: "그룹", status: "PAUSED", adgroupType: "WEB_SITE", userLock: true, bidAmt: "100", pcChannelId: "site-1", mobileChannelId: "site-1" };
const keyword = { id: "kw-1", campaignId: "cmp-1", adgroupId: "grp-1", keyword: "검색", status: "PAUSED", userLock: true, bidAmt: "100", useGroupBidAmt: true };
const payloads = {
  create_campaign: input.payload,
  budget_campaign: { campaignId: "cmp-1", dailyBudget: "1000" },
  create_adgroup: { campaignId: "cmp-1", name: "그룹", bidAmt: "100", pcChannelId: "site-1", mobileChannelId: "site-1" },
  bid_adgroup: { campaignId: "cmp-1", adgroupId: "grp-1", bidAmt: "100" },
  create_keyword: { campaignId: "cmp-1", adgroupId: "grp-1", keyword: "검색", bidAmt: "100" },
  bid_keyword: { campaignId: "cmp-1", adgroupId: "grp-1", keywordId: "kw-1", bidAmt: "100" },
};
function memory() {
  const map = new Map();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
}
const key = journal.naverIntentKey("u1", "1", "23");
const context = (path, workspaceId = "1") => ({ params: Promise.resolve({ workspaceId, path: path.split("/") }) });
const request = (path, options = {}) => new Request(`https://app.example/api/workspaces/1/integrations/naver/management/${path}`, options);
const post = (body = input, { origin = "https://app.example", headers = {}, ...rest } = {}) => route.POST(request("operations", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { ...(origin ? { origin } : {}), "content-type": "application/json", ...headers }, ...rest,
}), context("operations"));
let forwarded = [];
function proxy(payload, status = 200, headers) {
  forwarded = [];
  globalThis.__naverManagementProxy = async (...args) => { forwarded.push(args); return Response.json(payload, { status, headers }); };
}

test("six exact actions only: string bigints, UUIDv4, NCC IDs, no bulk or extra mutation fields", () => {
  for (const [action, payload] of Object.entries(payloads)) {
    const value = { ...intent, action, payload };
    assert.deepEqual(management.naverOperationInput(value), value);
    assert.equal(management.naverOperationInput({ ...value, payload: { ...payload, userLock: false } }), null);
  }
  for (const value of [null, [], { ...input, accountId: 23 }, { ...input, accountId: "023" }, { ...input, accountId: "9223372036854775808" },
    { ...input, requestId: requestId.replace("4567", "1567") }, { ...input, requestId: `${requestId}\n` }, { ...input, action: "resume_campaign" },
    { ...input, action: "rename_campaign" }, { ...input, extra: true }, { ...input, payload: { name: "x", dailyBudget: 100 } },
    { ...intent, action: "create_keyword", payload: { ...payloads.create_keyword, keyword: ["one", "two"] } }]) assert.equal(management.naverOperationInput(value), null);
  for (const value of ["", "x".repeat(101), "cmp/id", "cmp\n", "cmp%2f", "cmp.id"]) assert.equal(management.isNccId(value), false);
});

test("names and a single keyword trim safely, reject controls, enforce 50/25 characters", () => {
  assert.equal(management.naverOperationInput({ ...input, payload: { ...input.payload, name: "  캠페인  " } }).payload.name, "캠페인");
  for (const name of ["", " ", "x".repeat(51), "a\nb", "a\tb", "a\x7fb", "a\u0085b"]) assert.equal(management.naverOperationInput({ ...input, payload: { ...input.payload, name } }), null);
  for (const word of ["", " ", "x".repeat(26), "a\nb"]) assert.equal(management.naverOperationInput({ ...intent, action: "create_keyword", payload: { ...payloads.create_keyword, keyword: word } }), null);
  assert.ok(management.naverOperationInput({ ...intent, action: "create_keyword", payload: { ...payloads.create_keyword, keyword: "가".repeat(25) } }));
  for (const channel of [null, "", "site/id"]) assert.equal(management.naverOperationInput({ ...intent, action: "create_adgroup", payload: { ...payloads.create_adgroup, pcChannelId: channel } }), null);
});

test("KRW budget and bid limits use exact digit strings with 10-won steps", () => {
  for (const v of ["70", "1000", "100000"]) assert.ok(management.validNaverAmount(v));
  assert.ok(management.validNaverAmount("1000000000", true));
  for (const v of ["69", "71", "100010", "1e3", "+100", "100.0", "100\n", " 100", "", 100, "9".repeat(80)]) assert.equal(management.validNaverAmount(v), false);
  assert.equal(management.validNaverAmount("1000000010", true), false);
});

test("GET query allowlist rejects duplicates, cross-scope extras and missing selections", () => {
  for (const [path, q] of [["campaigns", "accountId=23"], ["channels", "accountId=23"], ["pending", "accountId=23"], ["adgroups", "accountId=23&campaignId=cmp-1"], ["keywords", "accountId=23&campaignId=cmp-1&adgroupId=grp-1"]]) assert.equal(management.naverManagementQuery([path], new URLSearchParams(q)), `?${q}`);
  assert.equal(management.naverManagementQuery(["operations", requestId], new URLSearchParams()), "");
  for (const [path, q] of [["pending", "accountId=23&accountId=24"], ["campaigns", "accountId=23&secret=x"], ["adgroups", "accountId=23"], ["keywords", "accountId=23&campaignId=cmp-1"], ["operations/" + requestId, "accountId=23"]]) assert.equal(management.naverManagementQuery(path.split("/"), new URLSearchParams(q)), null);
});

test("public parsers preserve observed amounts/locks and strip upstream secrets and result snapshots", () => {
  for (const [parse, value] of [[management.parseManagedNaverCampaigns, campaign], [management.parseManagedNaverAdgroups, group], [management.parseManagedNaverKeywords, keyword]]) {
    assert.deepEqual(parse([{ ...value, apiKey: "private" }]), [value]);
    assert.equal(parse([value, value]), null);
  }
  assert.deepEqual(management.parseNaverChannels([]), []);
  const parsed = management.parseNaverOperation(op("succeeded", { result: { campaignId: "cmp-1", provider: { secret: "private" }, secretKey: "private" }, errorCode: "private" }));
  assert.deepEqual(parsed.result, { campaignId: "cmp-1" }); assert.equal(parsed.errorCode, null);
  assert.doesNotMatch(JSON.stringify(parsed), /private|provider/);
  assert.equal(management.parseNaverOperation(op("pending", { accountId: 23 })), null);
});

test("edit gates require all relevant locks, parent identity, and WEB_SITE campaign/adgroup", () => {
  assert.ok(management.editableNaverKeyword(campaign, group, keyword));
  for (const c of [{ ...campaign, userLock: false }, { ...campaign, campaignType: "SHOPPING" }]) assert.equal(management.editableNaverKeyword(c, group, keyword), false);
  for (const g of [{ ...group, userLock: false }, { ...group, adgroupType: "SHOPPING" }, { ...group, campaignId: "other" }]) assert.equal(management.editableNaverKeyword(campaign, g, keyword), false);
  for (const k of [{ ...keyword, userLock: false }, { ...keyword, campaignId: "other" }, { ...keyword, adgroupId: "other" }]) assert.equal(management.editableNaverKeyword(campaign, group, k), false);
});

test("BFF forwards only allowlisted reads and journal POSTs with no-store and refreshed cookies", async () => {
  const headers = new Headers(); headers.append("Set-Cookie", "access=updated; HttpOnly"); headers.append("Set-Cookie", "refresh=updated; HttpOnly"); headers.set("x-private", "private");
  for (const [path, payload] of [["campaigns?accountId=23", [campaign]], ["channels?accountId=23", []], ["adgroups?accountId=23&campaignId=cmp-1", [group]], ["keywords?accountId=23&campaignId=cmp-1&adgroupId=grp-1", [keyword]], ["pending?accountId=23", null], [`operations/${requestId}`, op()]]) {
    proxy(payload, 200, headers);
    const response = await route.GET(request(path), context(path.split("?")[0]));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), payload);
    assert.equal(response.headers.getSetCookie().length, 2); assert.equal(response.headers.get("cache-control"), "private, no-store"); assert.equal(response.headers.get("x-private"), null);
    assert.equal(forwarded[0][0], `/workspaces/1/integrations/naver/management/${path}`); assert.equal(forwarded[0][1].cache, "no-store");
  }
  proxy(op("succeeded"), 201, headers);
  const response = await post(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), op("succeeded"));
  assert.deepEqual(JSON.parse(forwarded[0][1].body), input);
  assert.equal(response.headers.getSetCookie().length, 2);
});

test("BFF blocks unsupported routes/methods, unsafe origin/content-type and >4KiB actual bytes", async () => {
  proxy({});
  for (const path of ["campaigns/extra", "resume", "operations/not-v4", "operations", "delete", "keywords/kw-1"]) assert.equal((await route.GET(request(path), context(path))).status, 404);
  assert.equal((await route.POST(request("campaigns", { method: "POST" }), context("campaigns"))).status, 404);
  assert.equal(route.DELETE, undefined); assert.equal(route.PATCH, undefined);
  for (const options of [{ origin: null }, { origin: "https://other.example" }, { headers: { "sec-fetch-site": "same-site" } }, { headers: { "sec-fetch-site": "cross-site" } }]) assert.equal((await post(input, options)).status, 403);
  assert.equal((await post(input, { headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await post({ ...input, token: "private" })).status, 400);
  assert.equal((await post(" ".repeat(4097))).status, 413);
  assert.equal((await post(input, { headers: { "content-length": "4097" } })).status, 413);
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(2048)); c.enqueue(new Uint8Array(2049)); c.close(); } });
  const response = await route.POST(request("operations", { method: "POST", duplex: "half", body: stream, headers: { origin: "https://app.example", "content-type": "application/json", "content-length": "1" } }), context("operations"));
  assert.equal(response.status, 413); assert.equal(forwarded.length, 0);
});

test("BFF rejects foreign resource and journal identities and redacts every error", async () => {
  for (const [path, payload] of [["adgroups?accountId=23&campaignId=cmp-1", [{ ...group, campaignId: "other" }]], ["keywords?accountId=23&campaignId=cmp-1&adgroupId=grp-1", [{ ...keyword, adgroupId: "other" }]], ["pending?accountId=23", op("pending", { accountId: "24" })], ["pending?accountId=23", op("failed")], [`operations/${requestId}`, op("pending", { requestId: secondId })]]) {
    proxy(payload); assert.equal((await route.GET(request(path), context(path.split("?")[0]))).status, 502);
  }
  proxy(op("succeeded", { accountId: "24" })); assert.equal((await post()).status, 502);
  for (const code of [...management.NAVER_MANAGEMENT_CODES, "private-code"]) {
    proxy({ code, message: "private-provider-body", apiKey: "private" }, 409);
    const response = await post(); const body = await response.text();
    assert.equal(response.status, 409); assert.doesNotMatch(body, /private/);
    assert.equal(JSON.parse(body).code, code === "private-code" ? undefined : code);
  }
});

test("durable intent contains only request/account/action and scopes user/workspace/account", () => {
  const storage = memory(); journal.persistNaverIntent(storage, key, input);
  assert.deepEqual(JSON.parse(storage.getItem(key)), intent);
  assert.doesNotMatch(storage.getItem(key), /payload|name|dailyBudget/);
  assert.deepEqual(journal.readNaverIntent(storage, key, "23"), intent);
  assert.throws(() => journal.readNaverIntent(storage, key, "24"));
  assert.equal(new Set([key, journal.naverIntentKey("u2", "1", "23"), journal.naverIntentKey("u1", "2", "23"), journal.naverIntentKey("u1", "1", "24")]).size, 4);
});

test("storage failure or silent write drop blocks POST before it starts", async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("unexpected"); };
  for (const fail of [() => { throw new Error("full"); }, () => {}]) {
    const storage = memory(); storage.setItem = fail;
    await assert.rejects(journal.submitNaverOperation("1", input, storage, key), /저장/);
  }
  assert.equal(calls, 0);
});

test("all started POST errors recover with GET only, never retransmit, including 400/403/409/500", async () => {
  for (const status of [0, 400, 403, 409, 500]) {
    const storage = memory(), calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push([url, init]);
      if (init.method === "POST") {
        assert.deepEqual(JSON.parse(storage.getItem(key)), intent);
        if (!status) throw new Error("lost response");
        return Response.json({ code: "NAVER_ADS_OPERATION_CONFLICT", message: "private" }, { status });
      }
      return Response.json(url.includes("pending?") ? null : op("succeeded"));
    };
    const value = await journal.submitNaverOperation("1", input, storage, key);
    assert.equal(value.operation.status, "succeeded"); assert.equal(storage.getItem(key), null);
    assert.equal(calls.filter(([, init]) => init.method === "POST").length, 1);
    assert.equal(calls.filter(([, init]) => init.method !== "POST").length, 2);
    assert.ok(calls.every(([, init]) => init.cache === "no-store" && init.credentials === "same-origin"));
  }
});

test("refresh/remount and lost POST 404 remain blocked; pending/unknown never clear or POST", async () => {
  for (const state of ["pending", "unknown", "404"]) {
    const storage = memory(); journal.persistNaverIntent(storage, key, intent); const calls = [];
    globalThis.fetch = async (url, init) => { calls.push([url, init]); return url.includes("pending?") ? Response.json(null) : state === "404" ? Response.json({}, { status: 404 }) : Response.json(op(state)); };
    const recovered = await journal.recoverNaverAccount("1", "23", storage, key);
    assert.deepEqual(recovered.intent, intent); assert.equal(journal.readNaverIntent(storage, key, "23").requestId, requestId);
    assert.ok(calls.every(([, init]) => init.method !== "POST"));
    await assert.rejects(journal.submitNaverOperation("1", input, storage, key));
    assert.throws(() => journal.clearFailedNaverOperation(storage, key, recovered));
    if (state === "404") assert.ok(recovered.error);
  }
});

test("server pending work from another device is fetched and persisted before any new write", async () => {
  const storage = memory(), calls = [];
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return Response.json(op("unknown", { requestId: secondId })); };
  const recovered = await journal.recoverNaverAccount("1", "23", storage, key);
  assert.equal(recovered.intent.requestId, secondId); assert.equal(recovered.pending.status, "unknown");
  assert.ok(calls[0][0].endsWith("pending?accountId=23"));
  await assert.rejects(journal.submitNaverOperation("1", input, storage, key));
  assert.equal(calls.length, 1);
});

test("terminal failure stays durable until an explicit clear; no implicit same-ID retry", async () => {
  const storage = memory(); journal.persistNaverIntent(storage, key, intent);
  globalThis.fetch = async (url) => Response.json(url.includes("pending?") ? null : op("failed", { errorCode: "NAVER_ADS_REJECTED" }));
  const failed = await journal.recoverNaverAccount("1", "23", storage, key);
  assert.deepEqual(failed.intent, intent); assert.equal(failed.operation.status, "failed");
  await assert.rejects(journal.submitNaverOperation("1", input, storage, key));
  journal.clearFailedNaverOperation(storage, key, failed); assert.equal(storage.getItem(key), null);
  const next = await journal.recoverNaverAccount("1", "23", storage, key); assert.equal(next.intent, null);
});

test("foreign account/request/action lookup responses never clear durable intent", async () => {
  for (const change of [{ accountId: "24" }, { requestId: secondId }, { action: "create_keyword" }]) {
    const storage = memory(); journal.persistNaverIntent(storage, key, intent);
    globalThis.fetch = async (url) => Response.json(url.includes("pending?") ? null : op("succeeded", change));
    const result = await journal.recoverNaverAccount("1", "23", storage, key);
    assert.ok(result.error); assert.equal(result.operation, null); assert.deepEqual(result.intent, intent); assert.notEqual(storage.getItem(key), null);
  }
});

test("aborted tenant/account scope does not accept a late lookup or clear storage", async () => {
  const storage = memory(); journal.persistNaverIntent(storage, key, intent); const controller = new AbortController(); let finish;
  globalThis.fetch = async (url) => url.includes("pending?") ? Response.json(null) : new Promise((resolve) => { finish = resolve; });
  const recovering = journal.recoverNaverAccount("1", "23", storage, key, controller.signal);
  for (let i = 0; i < 20 && !finish; i++) await new Promise((resolve) => setImmediate(resolve));
  controller.abort(); finish(Response.json(op("succeeded")));
  await assert.rejects(recovering, { name: "AbortError" }); assert.deepEqual(journal.readNaverIntent(storage, key, "23"), intent);
});
