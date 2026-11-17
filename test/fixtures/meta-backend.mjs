// Isolated UI verification only. All identities and advertising data below are fictional.
// AUTH_API_URL=http://127.0.0.1:8103 next dev --port 3103 in an isolated frontend copy.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const workspace = { id: '900', name: 'Meta 화면 검증 워크스페이스', slug: 'meta-ui-fixture', role: 'owner', status: 'active', defaultCurrency: 'KRW', timezone: 'Asia/Seoul', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const account = { id: '50', connectionId: '60', platform: 'meta_ads', externalAccountId: '123456789', name: '모의 Meta 광고계정', currency: 'KRW', timezone: 'Asia/Seoul', status: 'active' };
export function createMetaFixtureServer() {
  let scenario = 'unconfigured';
  let delay = 0;
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const json = (payload, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }); response.end(JSON.stringify(payload)); };
    if (url.pathname === '/__test/state' && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!['unconfigured', 'connected', 'empty', 'reauth', 'error', 'viewer'].includes(body.scenario)) return json({ message: 'Unknown fixture scenario' }, 400);
      scenario = body.scenario; delay = Math.min(5000, Math.max(0, Number(body.delay ?? 0)));
      return json({ scenario, delay });
    }
    if (url.pathname === '/auth/oauth/google') {
      response.writeHead(302, { Location: 'http://localhost:3103/api/auth/oauth/callback?code=meta-ui-fixture-only' }); response.end(); return;
    }
    if (url.pathname === '/auth/oauth/exchange' || url.pathname === '/auth/refresh') return json({ accessToken: `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ sub: '900', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture-only`, refreshToken: 'meta-ui-fixture-refresh', tokenType: 'Bearer' });
    if (url.pathname === '/auth/me') return json({ id: '900', email: 'meta-ui@example.test', displayName: '모의 데이터 화면 검증', isPlatformAdmin: false });
    const scopedWorkspace = { ...workspace, role: scenario === 'viewer' ? 'viewer' : 'owner' };
    if (url.pathname === '/workspaces') return json([scopedWorkspace]);
    if (url.pathname === '/workspaces/900') return json(scopedWorkspace);
    if (url.pathname === '/workspaces/invitations') return json([]);
    const base = '/workspaces/900/integrations/meta';
    if (url.pathname === `${base}/configuration`) return json({ configured: scenario !== 'unconfigured', missing: scenario === 'unconfigured' ? ['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_API_VERSION', 'META_TOKEN_ENCRYPTION_KEY'] : [] });
    if (url.pathname === `${base}/connections`) return json([{ id: '60', status: scenario === 'reauth' ? 'reauth_required' : 'active', tokenExpiresAt: '2030-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }]);
    if (url.pathname === `${base}/accounts`) return json(scenario === 'empty' ? [] : [account]);
    if (url.pathname === `${base}/connections/60/available-accounts`) return json([{ externalAccountId: account.externalAccountId, name: account.name, currency: account.currency, timezone: account.timezone, accountStatus: 1 }]);
    if (url.pathname === `${base}/report`) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (scenario === 'reauth') return json({ code: 'META_ADS_REAUTH_REQUIRED' }, 401);
      if (scenario === 'error') return json({ code: 'META_ADS_UPSTREAM_UNAVAILABLE' }, 502);
      const campaigns = Array.from({ length: 28 }, (_, i) => ({ id: String(1000 + i), name: i === 0 ? '긴 캠페인 이름도 모바일에서 겹치지 않고 확인할 수 있는지 검증하는 모의 데이터' : `모의 캠페인 ${i + 1}`, status: 'PAUSED', effectiveStatus: 'PAUSED', objective: 'OUTCOME_TRAFFIC', dailyBudget: '1000', lifetimeBudget: null, metrics: { impressions: '1200', clicks: '20', spend: '1000', reach: '900' } }));
      return json({ platform: 'meta', account, dateFrom: url.searchParams.get('dateFrom') || '2026-10-05', dateTo: url.searchParams.get('dateTo') || '2026-11-03', fetchedAt: new Date().toISOString(), campaigns, totals: { impressions: '33600', clicks: '560', spend: '28000', reach: '18000' } });
    }
    return json({ message: 'No fixture route' }, 404);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) createMetaFixtureServer().listen(8103, '127.0.0.1', () => console.log('Meta UI fixture: http://127.0.0.1:8103 (fictional data only)'));
