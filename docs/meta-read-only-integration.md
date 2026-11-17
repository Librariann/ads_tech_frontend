# Meta Read-Only Integration

## Backend Contract

- Base: `/workspaces/:workspaceId/integrations/meta` through the same-origin frontend BFF.
- `GET configuration` is available to every active workspace role. Return HTTP 200 with `{ configured: false, missing: [...] }` when setup is incomplete, not an application outage. Missing entries are configuration names only. Include `META_TOKEN_ENCRYPTION_KEY` in readiness checks.
- `GET connections`, `GET connections/:id/available-accounts`, `GET accounts`, `GET report?accountId=...` use the agreed read-only response shapes.
- `POST oauth/start` has no upstream body. Request `ads_read` first, with no ad-management permissions.
- `POST accounts` accepts exactly string `{ connectionId, externalAccountId }`. External IDs contain digits only, without `act_`. Registration is explicit; no automatic account creation. Accessible inactive provider accounts may be registered for historical reporting.
- Internal IDs are positive signed PostgreSQL bigint strings, maximum `9223372036854775807`.
- Registered accounts use `platform: "meta_ads"`; reports use top-level `platform: "meta"`. Only active workspace registrations are selected for reports.
- Spend is a whole-currency decimal string. Campaign budget fields are intentionally not displayed or converted: Meta budget offsets have not been verified for every currency. No conversion metrics, ROAS, or cross-account totals are synthesized.
- Report dates may be omitted together for the backend default; explicit dates are paired, real dates, and at most 92 days inclusive. Backend must enforce account ownership and workspace permissions.

## OAuth And Errors

- Success: `/workspaces/:wid/advertising?platform=meta&meta=connected&connectionId=N`.
- Failure: `/advertising?meta=connection_failed`; the entry page retains failure context when selecting a workspace.
- Expired/revoked provider tokens: HTTP 401 with `META_ADS_REAUTH_REQUIRED`. This is not an application logout. Genuine JWT 401 responses retain the existing application refresh/logout behavior.
- Safe error codes retained by the BFF: `META_ADS_NOT_CONFIGURED`, `META_ADS_PERMISSION_REQUIRED`, `META_ADS_RATE_LIMITED`, `ENTITLEMENT_LIMIT_EXCEEDED`, `ACTIVE_SUBSCRIPTION_REQUIRED`, and the reauth code above. Raw provider messages are discarded.
- Token expiry UI uses the same 60-second safety margin as the backend.
- Configuration must not return secret values, encryption keys, or token-bearing URLs. OAuth start alone returns the authorization URL, restricted by the UI to Meta's HTTPS Facebook OAuth endpoint.

## Local Verification

No Meta credentials or running backend are required for focused mock tests:

```sh
node --test test/meta-integration.test.mjs test/meta-ui.test.mjs
npx tsc --noEmit --incremental false --pretty false
```

The frontend does not change the running development server or build into its `.next` directory. Production build verification can run separately in an isolated copy.

`test/fixtures/meta-backend.mjs` supports isolated browser verification at backend
port 8103 and frontend port 3103. All users, workspaces, accounts, and advertising
figures in that fixture are fictional. Never point the normal frontend at it.
Run it with `node test/fixtures/meta-backend.mjs`, then run an isolated frontend
with `AUTH_API_URL=http://127.0.0.1:8103 next dev --webpack --port 3103`. Use
`http://localhost:3103/login` for this fixture's mock login. Shut down both fixture
servers after verification; live authorization requires the actual Meta app.
