"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import {
  canManageMeta, formatMetaTime, isMetaAccounts, isMetaAvailableAccounts, isMetaConfiguration,
  isMetaConnections, MetaApiError, metaAuthorizationUrl, metaConnectionNeedsAuth, metaRequest, safeMetaMissingNames,
  type MetaAccount, type MetaAvailableAccount, type MetaConfiguration, type MetaConnection,
} from "@/lib/integrations/meta";

type Snapshot = { configuration: MetaConfiguration; connections: MetaConnection[]; accounts: MetaAccount[] };
const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d5dadd] px-4 text-sm font-semibold text-[#176a4b] disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass = "mt-2 min-h-11 w-full min-w-0 rounded-md border border-[#d5dadd] bg-white px-3 text-sm";
const errorText = (error: unknown) => error instanceof MetaApiError ? error.message : "Meta 정보를 불러오지 못했습니다. 다시 시도해 주세요.";

export function MetaSection({ workspaceId, role, callback, initialConnectionId }: {
  workspaceId: string; role: string; callback?: string; initialConnectionId?: string;
}) {
  const canManage = canManageMeta(role);
  const [refresh, setRefresh] = useState(0);
  const key = `${workspaceId}:${refresh}`;
  const [result, setResult] = useState<{ key: string; data?: Snapshot; error?: string }>();
  const [selectedConnection, setSelectedConnection] = useState(initialConnectionId ?? "");
  const [candidate, setCandidate] = useState("");
  const [available, setAvailable] = useState<{ key: string; accounts?: MetaAvailableAccount[]; error?: string }>();
  const [busy, setBusy] = useState<"connect" | "register" | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const actions = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    actions.current = controller;
    return () => controller.abort();
  }, [workspaceId]);
  const data = result?.key === key ? result.data : undefined;
  const loading = canManage && result?.key !== key;
  const connection = data?.connections.find((c) => c.id === selectedConnection) ??
    data?.connections.find((c) => !metaConnectionNeedsAuth(c)) ?? data?.connections[0];
  const connectionId = connection?.id ?? "";
  const needsAuth = !!connection && metaConnectionNeedsAuth(connection);
  const availableKey = `${key}:${connectionId}`;
  const availableResult = available?.key === availableKey ? available : undefined;
  const setupHref = `/dashboard/meta?workspaceId=${workspaceId}`;

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    const read = <T,>(path: string) => metaRequest<T>(workspaceId, path, { signal: controller.signal });
    void (async () => {
      try {
        const configuration = await read<unknown>("configuration");
        if (!isMetaConfiguration(configuration)) throw new MetaApiError(502);
        let connections: MetaConnection[] = [], accounts: MetaAccount[] = [];
        if (configuration.configured) {
          const [c, a] = await Promise.all([read<unknown>("connections"), read<unknown>("accounts")]);
          if (!isMetaConnections(c) || !isMetaAccounts(a)) throw new MetaApiError(502);
          connections = c; accounts = a;
        }
        if (!controller.signal.aborted) setResult({ key, data: { configuration, connections, accounts } });
      } catch (error) { if (!controller.signal.aborted) setResult({ key, error: errorText(error) }); }
    })();
    return () => controller.abort();
  }, [workspaceId, key, canManage]);

  useEffect(() => {
    if (!canManage || !data?.configuration.configured || !connectionId || needsAuth) return;
    const controller = new AbortController();
    void metaRequest<unknown>(workspaceId, `connections/${connectionId}/available-accounts`, { signal: controller.signal })
      .then((accounts) => {
        if (!isMetaAvailableAccounts(accounts)) throw new MetaApiError(502);
        if (!controller.signal.aborted) setAvailable({ key: availableKey, accounts });
      }).catch((error) => { if (!controller.signal.aborted) setAvailable({ key: availableKey, error: errorText(error) }); });
    return () => controller.abort();
  }, [workspaceId, canManage, data, connectionId, needsAuth, availableKey]);

  async function connect() {
    if (!canManage || !data?.configuration.configured || busy) return;
    const signal = actions.current?.signal;
    setBusy("connect"); setActionError("");
    try {
      const result = await metaRequest<{ authorizationUrl: string }>(workspaceId, "oauth/start", { method: "POST", signal });
      if (signal?.aborted) return;
      const url = metaAuthorizationUrl(result.authorizationUrl);
      if (!url) throw new MetaApiError(502);
      window.location.assign(url);
    } catch (error) { if (!signal?.aborted) setActionError(errorText(error)); }
    finally { if (!signal?.aborted) setBusy(null); }
  }

  const registered = (externalId: string) => data?.accounts.some((a) => a.externalAccountId === externalId && a.connectionId === connectionId && a.status === "active");
  const selected = availableResult?.accounts?.find((a) => a.externalAccountId === candidate && !registered(a.externalAccountId));
  async function register() {
    if (!canManage || !selected || !connectionId || needsAuth || busy) return;
    const signal = actions.current?.signal;
    setBusy("register"); setActionError(""); setNotice("");
    try {
      await metaRequest(workspaceId, "accounts", { method: "POST", signal, body: JSON.stringify({ connectionId, externalAccountId: selected.externalAccountId }) });
      if (signal?.aborted) return;
      setNotice("Meta 광고계정을 등록했습니다."); setCandidate(""); setRefresh((v) => v + 1);
    } catch (error) { if (!signal?.aborted) setActionError(errorText(error)); }
    finally { if (!signal?.aborted) setBusy(null); }
  }

  return <section id="meta" aria-label="Meta 계정 연결" aria-busy={loading || !!busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">연결 관리</h2>
      <div className="flex items-center gap-3">
        <Link href={setupHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#657168]">Meta 성과 보기 <ArrowRight className="size-4" aria-hidden="true" /></Link>
        {canManage && <button type="button" title="상태 다시 확인" aria-label="상태 다시 확인" onClick={() => { setActionError(""); setRefresh((v) => v + 1); }} disabled={loading || !!busy} className={actionClass}><RefreshCw className="size-4" aria-hidden="true" /></button>}
      </div>
    </div>
    {callback === "connection_failed" && <p role="alert" className="mt-4 text-sm leading-6 text-[#a23628]">Meta 인증을 완료하지 못했습니다. 아래 연결 상태를 확인하고 다시 시도해 주세요.</p>}
    {callback === "connected" && <p role="status" className="mt-4 text-sm leading-6 text-[#176a4b]">Meta 인증을 완료했습니다. 사용할 광고계정을 선택해 등록해 주세요.</p>}
    {!canManage ? <div className="py-5"><h3 className="font-bold">관리 권한이 필요합니다</h3><p className="mt-2 text-sm text-[#657168]">Meta 연결과 광고계정 등록은 워크스페이스 소유자 또는 관리자에게 요청해 주세요.</p></div> : <>
      {loading && <p role="status" className="flex items-center gap-2 py-7 text-sm"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Meta 연결 상태를 확인하고 있습니다.</p>}
      {result?.key === key && result.error && <p role="alert" className="mt-4 text-sm text-[#a23628]">{result.error}</p>}
      {data && !data.configuration.configured && <div className="py-5">
        <h3 className="font-bold">Meta 연결 설정이 아직 준비되지 않았습니다</h3>
        <p className="mt-2 text-sm leading-6 text-[#657168]">서비스 관리자에게 Meta 연결 설정을 요청해 주세요.</p>
        {safeMetaMissingNames(data.configuration.missing).length > 0 && <details className="mt-3 text-xs leading-6 text-[#657168]"><summary className="cursor-pointer">설정 상세</summary><p className="mt-2 break-words">미설정 항목: {safeMetaMissingNames(data.configuration.missing).join(", ")}</p></details>}
      </div>}
      {data?.configuration.configured && <>
        <div className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div><h3 className="font-bold">{!connection ? "Meta 계정을 연결해 주세요" : needsAuth ? "Meta 재인증이 필요합니다" : "Meta 인증 연결됨"}</h3>
            <p className="mt-2 text-sm text-[#657168]">조회 권한: ads_read · 읽기 전용</p></div>
          <button type="button" onClick={connect} disabled={!!busy} className={actionClass}>{busy === "connect" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ExternalLink className="size-4" aria-hidden="true" />}{connection ? "Meta 다시 연결" : "Meta 연결"}</button>
        </div>
        {!!data.connections.length && <label className="block max-w-md text-sm font-semibold">인증 연결
          <select value={connectionId} onChange={(e) => { setSelectedConnection(e.target.value); setCandidate(""); setActionError(""); }} disabled={!!busy} className={fieldClass}>
            {data.connections.map((c) => <option key={c.id} value={c.id}>연결 {c.id} · {metaConnectionNeedsAuth(c) ? "재인증 필요" : "정상"}</option>)}
          </select>
          <span className="mt-2 block text-xs font-normal text-[#657168]">인증 만료: {formatMetaTime(connection?.tokenExpiresAt ?? null)} (한국 시간)</span>
        </label>}
        {connection && !needsAuth && <div className="mt-5 border-t border-[#e2e5e7] py-5">
          <h3 className="font-bold">광고계정 등록</h3>
          {!availableResult && <p role="status" className="mt-3 text-sm">접근 가능한 Meta 광고계정을 불러오고 있습니다.</p>}
          {availableResult?.error && <p role="alert" className="mt-3 text-sm text-[#a23628]">{availableResult.error}</p>}
          {availableResult?.accounts?.length === 0 && <p className="mt-3 text-sm leading-6 text-[#657168]">접근 가능한 광고계정이 없습니다. Meta 비즈니스 설정에서 광고계정 접근 권한을 확인하거나 다른 Meta 계정으로 다시 연결해 주세요.</p>}
          {!!availableResult?.accounts?.length && <>
            <label className="mt-3 block max-w-md text-sm font-semibold">Meta 광고계정
              <select className={fieldClass} value={candidate} disabled={!!busy} onChange={(e) => setCandidate(e.target.value)}>
                <option value="">광고계정 선택</option>
                {availableResult.accounts.map((a) => <option key={a.externalAccountId} value={a.externalAccountId} disabled={registered(a.externalAccountId)}>{a.name || a.externalAccountId} · {a.currency} · {registered(a.externalAccountId) ? "등록됨" : a.accountStatus !== 1 ? `비활성 (${a.accountStatus}) · 과거 성과 조회` : a.externalAccountId}</option>)}
              </select>
            </label>
            <button type="button" className={`${actionClass} mt-4`} onClick={register} disabled={!selected || !!busy}>{busy === "register" && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}선택 계정 등록</button>
          </>}
        </div>}
        <div className="mt-5 border-t border-[#e2e5e7] py-5"><h3 className="font-bold">등록된 광고계정</h3>
          {data.accounts.length ? <ul className="mt-3 divide-y divide-[#e2e5e7]">{data.accounts.map((a) => <li key={a.id} className="py-3"><p className="break-words text-sm font-semibold">{a.name || a.externalAccountId}</p><p className="mt-1 break-words text-xs text-[#657168]">{a.externalAccountId} · {a.currency} · {a.timezone} · {a.status === "active" ? "등록됨" : "상태 확인 필요"}</p></li>)}</ul> : <p className="mt-3 text-sm text-[#657168]">등록된 Meta 광고계정이 없습니다.</p>}
        </div>
      </>}
      {actionError && <p role="alert" className="my-4 text-sm text-[#a23628]">{actionError}</p>}
      {notice && <p role="status" className="my-4 text-sm text-[#176a4b]">{notice}</p>}
    </>}
  </section>;
}
