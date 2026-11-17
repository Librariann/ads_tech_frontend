import {
  managementRequest, NaverManagementError, operationMatches, parseNaverIntent, parseNaverOperation,
  type NaverIntent, type NaverOperation, type NaverOperationInput,
} from "@/lib/integrations/naver-management";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export type NaverRecovery = { intent: NaverIntent | null; operation: NaverOperation | null; pending: NaverOperation | null; error: string };
export const naverIntentKey = (userId: string, workspaceId: string, accountId: string) =>
  `naver-management:v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(accountId)}`;
const unknown = () => new NaverManagementError("NAVER_ADS_OPERATION_UNKNOWN");
export function readNaverIntent(storage: Storage, key: string, accountId: string) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const intent = parseNaverIntent(JSON.parse(raw), accountId);
    if (!intent) throw unknown();
    return intent;
  } catch { throw new NaverManagementError("STORAGE_UNAVAILABLE"); }
}
export function persistNaverIntent(storage: Storage, key: string, intent: NaverIntent) {
  try {
    const raw = JSON.stringify({ requestId: intent.requestId, accountId: intent.accountId, action: intent.action });
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw unknown();
  } catch { throw new NaverManagementError("STORAGE_UNAVAILABLE"); }
}
function removeIntent(storage: Storage, key: string, intent: NaverIntent) {
  const stored = readNaverIntent(storage, key, intent.accountId);
  if (!stored || !operationMatches(stored, intent)) throw unknown();
  try {
    storage.removeItem(key);
    if (storage.getItem(key) !== null) throw unknown();
  } catch { throw new NaverManagementError("STORAGE_UNAVAILABLE"); }
}
function checkedOperation(raw: unknown, intent: NaverIntent) {
  const op = parseNaverOperation(raw);
  if (!op || !operationMatches(op, intent)) throw unknown();
  return op;
}
function active(signal?: AbortSignal) { signal?.throwIfAborted(); }
function finalize(storage: Storage, key: string, intent: NaverIntent | null, operation: NaverOperation | null, pending: NaverOperation | null, signal?: AbortSignal): NaverRecovery {
  active(signal);
  if (intent && operation?.status === "succeeded") { removeIntent(storage, key, intent); intent = null; }
  if (!intent && pending) {
    intent = { requestId: pending.requestId, accountId: pending.accountId, action: pending.action };
    persistNaverIntent(storage, key, intent); operation = pending;
  }
  return { intent, operation, pending, error: "" };
}

// Recovery never POSTs, including a missing journal entry after a lost response.
export async function recoverNaverAccount(workspaceId: string, accountId: string, storage: Storage, key: string, signal?: AbortSignal): Promise<NaverRecovery> {
  const rawPending = await managementRequest(workspaceId, `pending?${new URLSearchParams({ accountId })}`, { signal });
  active(signal);
  const pending = rawPending === null ? null : parseNaverOperation(rawPending);
  if (rawPending !== null && (!pending || pending.accountId !== accountId || !["pending", "unknown"].includes(pending.status))) throw unknown();
  const intent = readNaverIntent(storage, key, accountId);
  let operation: NaverOperation | null = null;
  if (intent) {
    try {
      operation = checkedOperation(await managementRequest(workspaceId, `operations/${intent.requestId}`, { signal }), intent);
      active(signal);
    } catch (error) {
      active(signal);
      return { intent, operation: null, pending, error: error instanceof NaverManagementError ? error.message : unknown().message };
    }
  }
  return finalize(storage, key, intent, operation, pending, signal);
}

export async function submitNaverOperation(workspaceId: string, input: NaverOperationInput, storage: Storage, key: string, signal?: AbortSignal): Promise<NaverRecovery> {
  active(signal);
  if (readNaverIntent(storage, key, input.accountId)) throw unknown();
  const intent: NaverIntent = { requestId: input.requestId, accountId: input.accountId, action: input.action };
  persistNaverIntent(storage, key, intent);
  active(signal);
  try {
    const op = checkedOperation(await managementRequest(workspaceId, "operations", { method: "POST", body: JSON.stringify(input), signal }), intent);
    active(signal);
    return finalize(storage, key, intent, op, ["pending", "unknown"].includes(op.status) ? op : null, signal);
  } catch (error) {
    active(signal);
    // Even a 4xx may follow a completed upstream write. Only GET can resolve it.
    try { return await recoverNaverAccount(workspaceId, input.accountId, storage, key, signal); }
    catch (recoveryError) {
      active(signal);
      const message = recoveryError instanceof NaverManagementError ? recoveryError.message : unknown().message;
      const original = error instanceof NaverManagementError ? error.message : "";
      return { intent, operation: null, pending: null, error: `${original ? `${original} ` : ""}${message}` };
    }
  }
}
export function clearFailedNaverOperation(storage: Storage, key: string, recovery: NaverRecovery) {
  if (!recovery.intent || !recovery.operation || recovery.operation.status !== "failed" || !operationMatches(recovery.operation, recovery.intent)) throw unknown();
  removeIntent(storage, key, recovery.intent);
}
