import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const hooksUrl = dataUrl(`
  export const useState = (initial) => [globalThis.__advertisingStates.shift() ?? initial, () => {}];
  export const useRef = (current) => ({current});
  export const useCallback = (callback) => callback;
  export const useEffect = () => {};
  export const startTransition = (callback) => callback();
`);
const linkUrl = dataUrl(`import {jsx} from ${JSON.stringify(jsxUrl)}; export default (props) => jsx("a", props);`);
const domainUrl = dataUrl(transpile(await read("lib/integrations/google-ads.ts")));
async function load(file, creationUrl) {
  return dataUrl(transpile(await read(file))
    .replaceAll('"react/jsx-runtime"', JSON.stringify(jsxUrl))
    .replaceAll('"react"', JSON.stringify(hooksUrl))
    .replaceAll('"next/link"', JSON.stringify(linkUrl))
    .replaceAll('"lucide-react"', JSON.stringify(pathToFileURL(require.resolve("lucide-react")).href))
    .replaceAll('"@/lib/integrations/google-ads"', JSON.stringify(domainUrl))
    .replaceAll('"@/components/integrations/google-ads-account-creation"', JSON.stringify(creationUrl ?? "")));
}
const creationUrl = await load("components/integrations/google-ads-account-creation.tsx");
const { GoogleAdsAccountCreation } = await import(creationUrl);
const { GoogleAdsSection } = await import(await load("components/integrations/google-ads-section.tsx", creationUrl));
function creation(availability) {
  globalThis.__advertisingStates = [availability, false, false, "", "광고계정", "", "KRW", "Asia/Seoul", false, false];
  return renderToStaticMarkup(GoogleAdsAccountCreation({ workspaceId: "1", workspaceName: "팀", request() {}, onImport() {}, onCreated() {} }));
}

test("unavailable account creation offers status recovery without an unusable form", () => {
  for (const availability of ["not_configured", "manager_access_required", "not_eligible", "temporarily_unavailable", "subscription_required"]) {
    const html = creation({ availability });
    assert.doesNotMatch(html, /<form|new-google-ad-email/);
    assert.match(html, /생성 요청 상태 다시 확인/);
  }
});

test("available creation retains consent and required account fields", () => {
  const html = creation({ availability: "available" });
  assert.match(html, /<form/);
  for (const id of ["name", "email", "currency", "timezone"]) assert.match(html, new RegExp(`new-google-ad-${id}`));
  assert.match(html, /type="checkbox"[^>]*required/);
  assert.match(html, /광고계정 만들고 초대 보내기/);
});

test("pending creation remains visible even when new account creation is unavailable", () => {
  const html = creation({ availability: "manager_access_required", latestRequest: {
    status: "unknown", name: "기존 요청", requestId: "pending-request", invitationEmail: "owner@example.com",
  } });
  assert.match(html, /pending-request/);
  assert.match(html, /계정 생성 결과 확인이 필요/);
  assert.doesNotMatch(html, /<form/);
});

test("connected view has one refresh action without a redundant wizard or connection selector", () => {
  globalThis.__advertisingStates = [{
    status: "connected", connectionId: "30", connections: [{id: "30", status: "active"}],
    accounts: [{id: "1", connectionId: "30", externalAccountId: "1234567890", name: "운영 계정", status: "active", currency: "KRW", timezone: "Asia/Seoul"}],
    availableAccounts: [], entitlement: {currentUsage: 1, limit: 10},
  }, "", false, false, "", "", false, "existing"];
  const html = renderToStaticMarkup(GoogleAdsSection({workspaceId: "1"}));
  assert.equal((html.match(/aria-label="연결 상태 다시 확인"/g) ?? []).length, 1);
  assert.match(html, /운영 계정/);
  assert.match(html, /다른 Google 계정 인증/);
  assert.doesNotMatch(html, /등록 단계|google-connection|광고계정이 연결됐습니다/);
});
