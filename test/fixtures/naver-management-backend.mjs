// Fictional, memory-only UI fixture. Never use with a deployed app or real cookies.
// Start explicitly: node test/fixtures/naver-management-backend.mjs
// Isolated frontend: AUTH_API_URL=http://127.0.0.1:8104 next dev --hostname 127.0.0.1 --port 3104
// Login: http://127.0.0.1:3104/api/auth/oauth/callback?code=naver-management-fixture-only
// Then visit http://127.0.0.1:3104/workspaces/900/naver
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const stamp = "2026-11-04T00:00:00Z";
const workspace = { id: "900", name: "모의 네이버 관리 검증", slug: "naver-management-fixture", role: "owner", status: "active", defaultCurrency: "KRW", timezone: "Asia/Seoul", createdAt: stamp, updatedAt: stamp };
const account = { id: "50", connectionId: "60", platform: "naver_ads", externalAccountId: "999999999", name: "모의 네이버 광고계정", currency: "KRW", timezone: "Asia/Seoul", status: "active", connectionStatus: "active" };
const base = "/workspaces/900/integrations/naver";
const initialCampaign = { id: "fixture-campaign-1", name: "모의 일시중지 캠페인", status: "PAUSED", campaignType: "WEB_SITE", userLock: true, dailyBudget: "1000" };
const initialGroup = { id: "fixture-adgroup-1", campaignId: initialCampaign.id, name: "모의 일시중지 그룹", status: "PAUSED", adgroupType: "WEB_SITE", userLock: true, bidAmt: "100", pcChannelId: "fixture-site-1", mobileChannelId: "fixture-site-1" };
const initialKeyword = { id: "fixture-keyword-1", campaignId: initialCampaign.id, adgroupId: initialGroup.id, keyword: "모의 키워드", status: "PAUSED", userLock: true, bidAmt: "100", useGroupBidAmt: false };
const site = { id: "fixture-site-1", name: "모의 SITE 비즈채널", type: "SITE", url: "https://example.test", status: "NORMAL" };
const required = {
  create_campaign: ["name", "dailyBudget"], budget_campaign: ["campaignId", "dailyBudget"],
  create_adgroup: ["campaignId", "name", "bidAmt", "pcChannelId", "mobileChannelId"],
  bid_adgroup: ["campaignId", "adgroupId", "bidAmt"], create_keyword: ["campaignId", "adgroupId", "keyword", "bidAmt"],
  bid_keyword: ["campaignId", "adgroupId", "keywordId", "bidAmt"],
};
const record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const ncc = (v) => typeof v === "string" && v.length >= 1 && v.length <= 100 && !/[^A-Za-z0-9_-]/.test(v);
const validAmount = (v, max) => typeof v === "string" && v.length <= 10 && /^[0-9]+$/.test(v) && Number(v) >= 70 && Number(v) <= max && Number(v) % 10 === 0;

export function createNaverManagementFixtureHandler() {
  let scenario, campaigns, groups, keywords, operations, sequence;
  function reset(next = "connected") {
    scenario = next; sequence = 1; operations = new Map();
    campaigns = [{ ...initialCampaign }]; groups = [{ ...initialGroup }]; keywords = [{ ...initialKeyword }];
    if (next === "active") { campaigns[0].userLock = false; campaigns[0].status = "ELIGIBLE"; }
    if (next === "unsupported") campaigns[0].campaignType = "SHOPPING";
    if (["pending", "unknown", "failed"].includes(next)) {
      const requestId = "00000000-0000-4000-8000-000000000001";
      operations.set(requestId, { fingerprint: "fixture-only", value: { requestId, accountId: "50", action: "create_campaign", status: next, result: null, errorCode: next === "failed" ? "NAVER_ADS_REJECTED" : null, createdAt: stamp, updatedAt: stamp } });
    }
  }
  reset();
  return async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const json = (payload, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "private, no-store" }); response.end(JSON.stringify(payload)); };
    const fail = (code, status = 400) => json({ code, message: "Fictional fixture request rejected" }, status);
    const body = async () => {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 4096) throw new Error("too large"); chunks.push(chunk); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    };
    try {
      if (url.pathname === "/__test/state") {
        if (request.method === "POST") {
          const input = await body();
          if (!["connected", "no_channels", "viewer", "active", "unsupported", "pending", "unknown", "failed"].includes(input.scenario)) return json({ message: "Unknown fixture scenario" }, 400);
          reset(input.scenario);
        }
        return json({ scenario, campaigns, groups, keywords, operations: [...operations.values()].map((entry) => entry.value) });
      }
      if (["/auth/oauth/exchange", "/auth/refresh", "/auth/login"].includes(url.pathname)) {
        const token = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ sub: "900", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture-only`;
        return json({ accessToken: token, refreshToken: "naver-management-fixture-only-refresh", tokenType: "Bearer" });
      }
      if (url.pathname === "/auth/me") return json({ id: "900", email: "naver-ui@example.test", displayName: "모의 사용자", isPlatformAdmin: false });
      const scopedWorkspace = { ...workspace, role: scenario === "viewer" ? "viewer" : "owner" };
      if (url.pathname === "/workspaces") return json([scopedWorkspace]);
      if (url.pathname === "/workspaces/invitations") return json([]);
      if (url.pathname === "/workspaces/900") return json(scopedWorkspace);
      if (url.pathname === `${base}/configuration`) return json({ configured: true });
      if (url.pathname === `${base}/accounts`) return json([account]);
      if (url.pathname === `${base}/report`) return json({ account, period: { dateFrom: "2026-11-01", dateTo: "2026-11-04" }, campaigns: campaigns.map((c) => ({ ...c, impressions: null, clicks: null, cost: null })), totals: { impressions: null, clicks: null, cost: null }, fetchedAt: new Date().toISOString() });
      const path = url.pathname.startsWith(`${base}/management/`) ? url.pathname.slice(`${base}/management/`.length) : "";
      if (!path) return json({ message: "No fixture route" }, 404);
      if (request.method === "GET" && path.startsWith("operations/")) {
        const entry = operations.get(path.slice("operations/".length));
        return entry ? json(entry.value) : json({ message: "Fixture operation not found" }, 404);
      }
      if (request.method === "GET") {
        if (url.searchParams.get("accountId") !== account.id) return json({ message: "Fixture account not found" }, 404);
        if (path === "pending") return json([...operations.values()].find((o) => ["pending", "unknown"].includes(o.value.status))?.value ?? null);
        if (path === "campaigns") return json(campaigns);
        if (path === "channels") return json(scenario === "no_channels" ? [] : [site]);
        if (path === "adgroups") return json(groups.filter((g) => g.campaignId === url.searchParams.get("campaignId")));
        if (path === "keywords") return json(keywords.filter((k) => k.campaignId === url.searchParams.get("campaignId") && k.adgroupId === url.searchParams.get("adgroupId")));
      }
      if (request.method !== "POST" || path !== "operations") return json({ message: "No fixture route" }, 404);
      if (scenario === "viewer") return json({ message: "Fixture owner/admin only" }, 403);
      const input = await body();
      const fields = required[input.action], p = input.payload;
      if (!record(input) || Object.keys(input).length !== 4 || input.accountId !== account.id || typeof input.requestId !== "string" || input.requestId.length !== 36 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId) || !fields || !record(p) || Object.keys(p).length !== fields.length || !fields.every((key) => Object.hasOwn(p, key))) return fail("NAVER_ADS_INVALID_INPUT");
      for (const field of fields) {
        if (field.endsWith("Id") && !ncc(p[field])) return fail("NAVER_ADS_INVALID_INPUT");
        if (field === "dailyBudget" && !validAmount(p[field], 1e9)) return fail("NAVER_ADS_INVALID_INPUT");
        if (field === "bidAmt" && !validAmount(p[field], 100000)) return fail("NAVER_ADS_INVALID_INPUT");
        if (["name", "keyword"].includes(field) && (typeof p[field] !== "string" || !p[field].trim() || /[\u0000-\u001f\u007f-\u009f]/.test(p[field]) || Array.from(p[field].trim()).length > (field === "name" ? 50 : 25))) return fail("NAVER_ADS_INVALID_INPUT");
      }
      const fingerprint = JSON.stringify([input.accountId, input.action, fields.map((field) => [field, p[field]])]);
      const existing = operations.get(input.requestId);
      if (existing) return existing.fingerprint === fingerprint ? json(existing.value) : fail("NAVER_ADS_OPERATION_CONFLICT", 409);
      if ([...operations.values()].some((o) => ["pending", "unknown"].includes(o.value.status))) return fail("NAVER_ADS_OPERATION_CONFLICT", 409);
      const c = campaigns.find((c) => c.id === p.campaignId), g = groups.find((g) => g.id === p.adgroupId && g.campaignId === p.campaignId), k = keywords.find((k) => k.id === p.keywordId && k.adgroupId === p.adgroupId && k.campaignId === p.campaignId);
      const value = { requestId: input.requestId, accountId: input.accountId, action: input.action, status: "pending", result: null, errorCode: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      operations.set(input.requestId, { fingerprint, value });
      const reject = (code) => { value.status = "failed"; value.errorCode = code; return json(value); };
      if (p.campaignId && !c || p.adgroupId && !g || p.keywordId && !k) return reject("NAVER_ADS_INVALID_INPUT");
      if (c && (c.campaignType !== "WEB_SITE" || g && g.adgroupType !== "WEB_SITE")) return reject("NAVER_ADS_UNSUPPORTED_TYPE");
      if (c && !c.userLock || g && !g.userLock || k && !k.userLock) return reject("NAVER_ADS_PAUSED_REQUIRED");
      if (input.action === "create_adgroup" && (scenario === "no_channels" || p.pcChannelId !== site.id || p.mobileChannelId !== site.id)) return reject("NAVER_ADS_CHANNEL_REQUIRED");
      const id = ++sequence;
      if (input.action === "create_campaign") { const created = { ...initialCampaign, id: `fixture-campaign-${id}`, name: p.name.trim(), dailyBudget: p.dailyBudget }; campaigns.push(created); value.result = { campaignId: created.id }; }
      if (input.action === "budget_campaign") { c.dailyBudget = p.dailyBudget; value.result = { campaignId: c.id }; }
      if (input.action === "create_adgroup") { const created = { ...initialGroup, id: `fixture-adgroup-${id}`, campaignId: c.id, name: p.name.trim(), bidAmt: p.bidAmt, pcChannelId: p.pcChannelId, mobileChannelId: p.mobileChannelId }; groups.push(created); value.result = { campaignId: c.id, adgroupId: created.id }; }
      if (input.action === "bid_adgroup") { g.bidAmt = p.bidAmt; value.result = { campaignId: c.id, adgroupId: g.id }; }
      if (input.action === "create_keyword") { const created = { ...initialKeyword, id: `fixture-keyword-${id}`, campaignId: c.id, adgroupId: g.id, keyword: p.keyword.trim(), bidAmt: p.bidAmt }; keywords.push(created); value.result = { campaignId: c.id, adgroupId: g.id, keywordId: created.id }; }
      if (input.action === "bid_keyword") { k.bidAmt = p.bidAmt; k.useGroupBidAmt = false; value.result = { campaignId: c.id, adgroupId: g.id, keywordId: k.id }; }
      value.status = "succeeded"; value.updatedAt = new Date().toISOString(); return json(value);
    } catch { return fail("NAVER_ADS_INVALID_INPUT"); }
  };
}

export function createNaverManagementFixtureServer() { return createServer(createNaverManagementFixtureHandler()); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FIXTURE_PORT ?? 8104);
  createNaverManagementFixtureServer().listen(port, "127.0.0.1", () => console.log(`Fictional NAVER management fixture: http://127.0.0.1:${port}`));
}
