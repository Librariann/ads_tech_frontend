// Isolated browser-test backend. Never connect this fixture to a deployed app.
import { createServer } from "node:http";

const port = Number(process.env.FIXTURE_PORT ?? 8101);
const workspaceId = "900";
const workspace = {
  id: workspaceId,
  name: "광고 등록 검증",
  slug: "advertising-qa",
  role: "owner",
  status: "active",
  defaultCurrency: "KRW",
  timezone: "Asia/Seoul",
};
const connections = [{ id: "30", status: "active" }];
const candidate = {
  customerId: "1234567890",
  name: "테스트 광고계정",
  currencyCode: "KRW",
  timeZone: "Asia/Seoul",
  manager: false,
  status: "ENABLED",
};
const account = {
  id: "50",
  connectionId: "30",
  externalAccountId: candidate.customerId,
  name: candidate.name,
  currency: "KRW",
  timezone: "Asia/Seoul",
  status: "active",
};
let scenario = "setup";
let registered = false;
let checks = 0;
let creation;
let createCalls = 0;
let invitationCalls = 0;
const jwt = () =>
  [
    "eyJhbGciOiJub25lIn0",
    Buffer.from(
      JSON.stringify({ sub: "900", exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url"),
    "fixture-only",
  ].join(".");
const tokens = () => ({
  accessToken: jwt(),
  refreshToken: "fixture-only-refresh",
  tokenType: "Bearer",
});

function onboarding() {
  const result = {
    status: "account_setup_required",
    reason: "account_not_enabled",
    connectionId: "30",
    connections,
    accounts: [],
    availableAccounts: [],
    entitlement: { currentUsage: 0, limit: 2 },
  };
  if (scenario === "new_accepted" && creation)
    return {
      ...result,
      status: registered ? "connected" : "account_selection_required",
      accounts: registered ? [account] : [],
      availableAccounts: registered
        ? []
        : [{ ...candidate, name: creation.name }],
      reservedCustomerIds: registered ? [] : [candidate.customerId],
      entitlement: { currentUsage: 2, limit: 2 },
    };
  if (scenario === "subscription")
    return { ...result, status: "subscription_required", entitlement: null };
  if (scenario === "authorization")
    return {
      ...result,
      status: "authorization_required",
      connections: [],
      connectionId: undefined,
    };
  if (scenario === "reauthorization")
    return {
      ...result,
      status: "reauthorization_required",
      connections: [{ id: "30", status: "reauth_required" }],
    };
  if (scenario === "empty") return { ...result, reason: "no_accounts" };
  if (scenario === "manager") return { ...result, reason: "manager_only" };
  if (
    scenario === "selection" ||
    scenario === "connected" ||
    scenario === "limit" ||
    scenario === "reconnect"
  ) {
    const connected = registered || scenario === "connected";
    return {
      ...result,
      reason: undefined,
      status: connected
        ? "connected"
        : scenario === "limit"
        ? "account_limit_reached"
        : "account_selection_required",
      accounts: connected
        ? [account]
        : scenario === "reconnect"
        ? [{ ...account, connectionId: "29" }]
        : [],
      availableAccounts: connected ? [] : [candidate],
      connections:
        scenario === "reconnect"
          ? [...connections, { id: "29", status: "reauth_required" }]
          : connections,
      entitlement: {
        currentUsage:
          connected || scenario === "limit" || scenario === "reconnect" ? 2 : 0,
        limit: 2,
      },
    };
  }
  return result;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    /* Invalid input is tested through the real BFF. */
  }
  let status = 200;
  let payload;
  if (url.pathname === "/auth/oauth/google") {
    response.writeHead(302, {
      Location:
        "http://127.0.0.1:3101/api/auth/oauth/callback?code=fixture-only",
    });
    response.end();
    return;
  }
  if (url.pathname === "/__test/state" && request.method === "POST") {
    scenario = body.scenario;
    if (!body.preserveCreation) {
      creation = undefined;
      createCalls = 0;
      invitationCalls = 0;
      registered = false;
    }
    checks = 0;
    payload = { scenario };
  } else if (url.pathname === "/__test/state") {
    payload = { scenario, registered, checks, createCalls, invitationCalls };
  } else if (
    url.pathname === "/auth/login" ||
    url.pathname === "/auth/refresh" ||
    url.pathname === "/auth/oauth/exchange"
  ) {
    payload = tokens();
  } else if (url.pathname === "/auth/me") {
    payload = {
      id: "900",
      email: "advertising-qa@example.test",
      displayName: "검증 사용자",
      isPlatformAdmin: false,
    };
  } else if (url.pathname === "/workspaces/invitations") {
    payload = [];
  } else if (url.pathname === "/workspaces") {
    payload = [workspace];
  } else if (url.pathname === `/workspaces/${workspaceId}`) {
    payload = workspace;
  } else if (url.pathname.endsWith("/account-creation")) {
    payload = {
      availability:
        scenario === "new_unconfigured"
          ? "not_configured"
          : scenario === "subscription"
          ? "subscription_required"
          : scenario === "new_ineligible"
          ? "not_eligible"
          : "available",
      latestRequest: creation,
    };
  } else if (
    url.pathname.endsWith("/account-creations") &&
    request.method === "POST"
  ) {
    if (!body.invitationConsent) {
      status = 400;
      payload = { message: "Invitation consent required" };
    } else if (
      creation &&
      creation.requestId !== body.requestId &&
      creation.status !== "connected" &&
      creation.status !== "failed"
    ) {
      status = 409;
      payload = { code: "GOOGLE_ADS_ACCOUNT_CREATION_IN_PROGRESS" };
    } else if (creation?.requestId === body.requestId) payload = creation;
    else {
      createCalls++;
      invitationCalls += scenario === "new_unknown" ? 0 : 1;
      creation = {
        id: "80",
        requestId: body.requestId,
        name: body.name,
        currencyCode: body.currencyCode,
        timeZone: body.timeZone,
        invitationEmail: body.invitationEmail,
        status: scenario === "new_unknown" ? "unknown" : "created",
        customerId: scenario === "new_unknown" ? null : candidate.customerId,
        invitationStatus:
          scenario === "new_unknown"
            ? "pending"
            : scenario === "new_invite_failed"
            ? "failed"
            : "sent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      payload = creation;
    }
  } else if (
    /\/account-creations\/80\/retry-invitation$/.test(url.pathname) &&
    request.method === "POST"
  ) {
    if (creation?.invitationStatus !== "failed") {
      status = 409;
      payload = { message: "No failed invitation" };
    } else {
      invitationCalls++;
      creation.invitationStatus = "sent";
      payload = creation;
    }
  } else if (url.pathname.endsWith("/onboarding")) {
    checks++;
    if (scenario === "failure") {
      status = 502;
      payload = { code: "GOOGLE_ADS_API_ERROR" };
    } else payload = onboarding();
  } else if (url.pathname.endsWith("/accounts") && request.method === "POST") {
    registered = true;
    if (creation) creation.status = "connected";
    payload = account;
  } else if (url.pathname.endsWith("/oauth/start")) {
    // Deliberately invalid origin to ensure a fixture never navigates to real OAuth.
    payload = { authorizationUrl: "https://invalid.example/fixture" };
  } else {
    status = 404;
    payload = { message: "Fixture route not found" };
  }
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Advertising QA fixture on http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());
