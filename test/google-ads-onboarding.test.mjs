import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/integrations/google-ads.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const {
  googleAdsStep,
  googleAdsSetupCopy,
  googleAdsErrorMessage,
  formatGoogleAdsId,
  selectableGoogleAdsAccounts,
  googleAdsCreationError,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("authorization is not presented as completed account registration", () => {
  assert.equal(googleAdsStep("subscription_required"), 0);
  assert.equal(googleAdsStep("authorization_required"), 1);
  assert.equal(googleAdsStep("reauthorization_required"), 1);
  for (const state of [
    "account_setup_required",
    "account_selection_required",
    "account_limit_reached",
  ])
    assert.equal(googleAdsStep(state), 2);
  assert.equal(googleAdsStep("connected"), 3);
});

test("disabled accounts do not imply OAuth failure or a confirmed signup cause", () => {
  const copy = googleAdsSetupCopy("account_not_enabled");
  assert.match(copy.description, /Google 인증은 완료/);
  assert.match(copy.description, /가입 미완료 또는 계정 비활성화/);
  assert.match(googleAdsSetupCopy("manager_only").description, /관리자 계정만/);
  assert.match(
    googleAdsSetupCopy("no_accounts").description,
    /다른 Google 계정/,
  );
});

test("actionable entitlement and reauthorization errors override generic HTTP errors", () => {
  assert.match(
    googleAdsErrorMessage("ENTITLEMENT_LIMIT_EXCEEDED", 403),
    /한도/,
  );
  assert.match(
    googleAdsErrorMessage("GOOGLE_ADS_REAUTH_REQUIRED", 401),
    /다시 인증/,
  );
  assert.match(
    googleAdsErrorMessage("ACTIVE_SUBSCRIPTION_REQUIRED", 402),
    /구독/,
  );
  assert.match(googleAdsErrorMessage(undefined, 403), /소유자 또는 관리자/);
  assert.doesNotMatch(googleAdsErrorMessage(undefined, 502), /토큰|secret/i);
});

test("customer IDs are formatted without changing unexpected identifiers", () => {
  assert.equal(formatGoogleAdsId("1234567890"), "123-456-7890");
  assert.equal(formatGoogleAdsId("123"), "123");
});

test("full quota allows reconnecting existing counted accounts but not new or disconnected accounts", () => {
  const candidate = { customerId: "1234567890" };
  const snapshot = {
    entitlement: { currentUsage: 2, limit: 2 },
    availableAccounts: [candidate, { customerId: "9876543210" }],
    connections: [{ id: "29", status: "reauth_required" }],
    accounts: [
      {
        externalAccountId: candidate.customerId,
        connectionId: "29",
        status: "active",
      },
    ],
  };
  assert.deepEqual(selectableGoogleAdsAccounts(snapshot), [candidate]);
  snapshot.accounts[0].status = "disconnected";
  assert.deepEqual(selectableGoogleAdsAccounts(snapshot), []);
  snapshot.accounts[0].status = "active";
  snapshot.connections[0].status = "error";
  assert.deepEqual(selectableGoogleAdsAccounts(snapshot), []);
  snapshot.entitlement.limit = null;
  assert.equal(selectableGoogleAdsAccounts(snapshot).length, 2);
});

test("an already reserved created account can connect without another quota slot", () => {
  const candidate = { customerId: "1234567890" };
  assert.deepEqual(
    selectableGoogleAdsAccounts({
      entitlement: { currentUsage: 2, limit: 2 },
      availableAccounts: [candidate, { customerId: "9876543210" }],
      accounts: [],
      connections: [],
      reservedCustomerIds: [candidate.customerId],
    }),
    [candidate],
  );
});

test("unconfigured or uncertain creation states never claim account creation succeeded", () => {
  assert.match(
    googleAdsCreationError("GOOGLE_ADS_ACCOUNT_CREATION_NOT_CONFIGURED"),
    /아직 준비되지/,
  );
  assert.match(
    googleAdsCreationError("GOOGLE_ADS_ACCOUNT_CREATION_NOT_ELIGIBLE"),
    /조건/,
  );
  assert.match(
    googleAdsCreationError("GOOGLE_ADS_ACCOUNT_CREATION_UNKNOWN"),
    /중복 생성/,
  );
  assert.doesNotMatch(
    googleAdsCreationError("GOOGLE_ADS_ACCOUNT_CREATION_UNKNOWN"),
    /다시 생성|생성 완료/,
  );
});
