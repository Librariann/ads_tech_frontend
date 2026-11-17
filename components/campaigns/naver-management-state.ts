"use client";

import { useEffect, useRef, useState } from "react";
import { naverRequest } from "@/lib/integrations/naver";
import { managementRequest, NaverManagementError, naverOperationInput, type NaverAction } from "@/lib/integrations/naver-management";
import {
  clearFailedNaverOperation, naverIntentKey, recoverNaverAccount, submitNaverOperation, type NaverRecovery,
} from "@/lib/integrations/naver-management-journal";

export const managementErrorText = (error: unknown) => error instanceof NaverManagementError ? error.message : "네이버 검색광고 정보를 확인하지 못했습니다. 잠시 후 상태를 다시 확인해 주세요.";

export function useNaverResource<T>(workspaceId: string, path: string, parse: (v: unknown) => T | null, revision: string, management = true) {
  const key = JSON.stringify([workspaceId, path, revision]);
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const raw = await (management ? managementRequest : naverRequest)(workspaceId, path, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const data = parse(raw);
        if (data === null) throw new NaverManagementError(undefined, 502);
        setResult({ key, data });
      } catch (error) { if (!controller.signal.aborted) setResult({ key, error: managementErrorText(error) }); }
    })();
    return () => controller.abort();
  }, [workspaceId, path, parse, key, management]);
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, loading: result?.key !== key };
}

export function useNaverOperations(userId: string, workspaceId: string, accountId: string) {
  const storageKey = naverIntentKey(userId, workspaceId, accountId);
  const [reload, setReload] = useState(0);
  const key = JSON.stringify([storageKey, reload]);
  const [state, setState] = useState<{ key: string; recovery?: NaverRecovery; error?: string }>();
  const [busy, setBusy] = useState(false);
  const [resourceVersion, setResourceVersion] = useState(0);
  const succeeded = useRef(new Set<string>());
  const session = useRef<{ key: string; controller: AbortController; locked: boolean } | null>(null);

  function accept(recovery: NaverRecovery, scopeKey: string) {
    setState({ key: scopeKey, recovery });
    const op = recovery.operation;
    if (op?.status === "succeeded" && !succeeded.current.has(op.requestId)) {
      succeeded.current.add(op.requestId); setResourceVersion((v) => v + 1);
    }
  }
  useEffect(() => {
    const current = { key, controller: new AbortController(), locked: true };
    session.current = current;
    void (async () => {
      try {
        const recovery = await recoverNaverAccount(workspaceId, accountId, localStorage, storageKey, current.controller.signal);
        if (!current.controller.signal.aborted && session.current === current) accept(recovery, key);
      } catch (error) {
        if (!current.controller.signal.aborted && session.current === current) setState({ key, error: managementErrorText(error) });
      } finally {
        if (!current.controller.signal.aborted && session.current === current) { current.locked = false; setBusy(false); }
      }
    })();
    const changed = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      current.locked = true; setReload((v) => v + 1);
    };
    window.addEventListener("storage", changed);
    return () => { current.controller.abort(); window.removeEventListener("storage", changed); };
  }, [key, storageKey, workspaceId, accountId]);

  const visible = state?.key === key ? state : undefined;
  const recovery = visible?.recovery;
  const error = visible?.error || recovery?.error || "";
  const loading = busy || !visible;
  const ready = !!recovery && !loading && !error && !recovery.intent && !recovery.pending;
  function refresh() {
    if (busy) return;
    if (session.current) session.current.locked = true;
    setReload((v) => v + 1);
  }
  async function submit(action: NaverAction, payload: Record<string, string>) {
    const current = session.current;
    if (!ready || !current || current.key !== key || current.locked) return;
    const input = naverOperationInput({ requestId: crypto.randomUUID(), accountId, action, payload });
    if (!input) return;
    current.locked = true; setBusy(true);
    try {
      const next = await submitNaverOperation(workspaceId, input, localStorage, storageKey, current.controller.signal);
      if (!current.controller.signal.aborted && session.current === current) accept(next, key);
    } catch (error) {
      if (!current.controller.signal.aborted && session.current === current) setState({ key, error: managementErrorText(error) });
    } finally {
      if (!current.controller.signal.aborted && session.current === current) { current.locked = false; setBusy(false); }
    }
  }
  function clearFailed() {
    if (loading || !recovery || session.current?.locked) return;
    try { clearFailedNaverOperation(localStorage, storageKey, recovery); refresh(); }
    catch (error) { setState({ key, error: managementErrorText(error) }); }
  }
  return { ready, loading, error, recovery, submit, refresh, clearFailed, resourceVersion };
}
