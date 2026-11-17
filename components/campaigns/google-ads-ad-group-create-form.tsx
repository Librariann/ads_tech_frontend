"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { canCreateCampaign, campaignBudgetText, parseDailyBudget } from "@/lib/integrations/google-ads-campaign";
import {
  adGroupApi, AdGroupApiError, adGroupErrorMessage, adGroupScopeMatches, adGroupStorageKey,
  parseAdGroupDraft, recoverAdGroup, submitAdGroup,
  type AdGroupDraft, type AdGroupPrepare, type AdGroupResult, type AdGroupScope,
} from "@/lib/integrations/google-ads-ad-group";
import { validateSearchAdFields, type SearchAdFields } from "@/lib/integrations/google-ads-search-ad";
import type { Workspace } from "@/lib/workspaces/types";
import { GoogleAdsSearchAdFields } from "./google-ads-search-ad-fields";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d8d0c8] px-4 text-sm font-bold hover:bg-[#f3eee8] focus-visible:outline-2 focus-visible:outline-[#c04b24] disabled:cursor-not-allowed disabled:opacity-50";
const emptyFields: SearchAdFields = { adGroupName: "", bid: "", finalUrl: "", headlines: ["", "", ""], descriptions: ["", ""], keywords: "", keywordMatchType: "EXACT" };
const phaseLabel = { ready: "입력 가능", submitted: "추가 결과 확인 필요", creating: "추가 처리 중", created: "광고 내용 추가 완료", failed: "광고 내용 추가 실패", unknown: "추가 결과 미확인" };

function readDraft(key: string, scope: AdGroupScope) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = parseAdGroupDraft(raw, scope);
    if (!value) throw new Error("Invalid saved intent");
    return value;
  } catch { throw new AdGroupApiError("CAMPAIGN_STORAGE_UNAVAILABLE"); }
}
function persistDraft(key: string, value: AdGroupDraft) {
  try {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error("Intent not persisted");
  } catch { throw new AdGroupApiError("CAMPAIGN_STORAGE_UNAVAILABLE"); }
}

export function GoogleAdsAdGroupCreateForm({ workspace, userId, scope, eligible }: {
  workspace: Workspace; userId: string; scope: AdGroupScope; eligible: boolean;
}) {
  const [fields, setFields] = useState<SearchAdFields>(emptyFields);
  const [prepared, setPrepared] = useState<AdGroupPrepare | null>(null);
  const [draft, setDraft] = useState<AdGroupDraft | null>(null);
  const [result, setResult] = useState<AdGroupResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedScope, setLoadedScope] = useState("");
  const [reload, setReload] = useState({ count: 0, fresh: false });
  const session = useRef<{ scopeKey: string; controller: AbortController; locked: boolean } | null>(null);
  const storageKey = adGroupStorageKey(userId, workspace.id, scope);
  const scopeKey = JSON.stringify([storageKey, scope.currency, eligible, workspace.role]);
  const canManage = eligible && canCreateCampaign(workspace.role);

  useEffect(() => {
    const current = { scopeKey, controller: new AbortController(), locked: false };
    session.current = current;
    const selected: AdGroupScope = { accountId: scope.accountId, customerId: scope.customerId, campaignId: scope.campaignId, campaignName: scope.campaignName, currency: scope.currency };
    const active = () => !current.controller.signal.aborted && session.current === current;
    const save = (value: AdGroupDraft) => {
      if (!active()) return;
      persistDraft(storageKey, value);
    };
    queueMicrotask(async () => {
      if (!active()) return;
      setBusy(true); setPrepared(null); setDraft(null); setResult(null); setError(""); setErrors({}); setStorageBlocked(false); setFields(emptyFields);
      setLoadedScope(scopeKey);
      try {
        const stored = readDraft(storageKey, selected);
        if (stored) {
          setDraft(stored);
          setFields({ ...stored.input.searchAd, bid: campaignBudgetText(stored.input.searchAd.cpcBidMicros), keywords: stored.input.searchAd.keywords.join("\n") });
        }
        const api = adGroupApi(workspace.id, selected);
        if (stored && !(reload.fresh && stored.phase === "failed" && canManage)) {
          const recovered = await recoverAdGroup(stored, api, save, current.controller.signal);
          if (!active()) return;
          setDraft(recovered.draft); setResult(recovered.result); setError(recovered.error);
        } else if (canManage) {
          const value = await api.prepare(current.controller.signal);
          if (active()) setPrepared(value);
        }
      } catch (cause) {
        if (!active()) return;
        setError(cause instanceof AdGroupApiError ? cause.message : "캠페인 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.");
        setStorageBlocked(cause instanceof AdGroupApiError && cause.code === "CAMPAIGN_STORAGE_UNAVAILABLE");
      } finally { if (active()) setBusy(false); }
    });
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      current.locked = true;
      setPrepared(null); setBusy(true);
      setReload((value) => ({ count: value.count + 1, fresh: false }));
    };
    window.addEventListener("storage", storageChanged);
    return () => { current.controller.abort(); window.removeEventListener("storage", storageChanged); };
  }, [scopeKey, storageKey, workspace.id, canManage, scope.accountId, scope.customerId, scope.campaignId, scope.campaignName, scope.currency, reload]);

  const currentScope = loadedScope === scopeKey;
  const visibleDraft = currentScope ? draft : null;
  const visibleResult = currentScope ? result : null;
  const waiting = busy || !currentScope;
  const enabled = currentScope && canManage && !busy && !storageBlocked && Boolean(prepared && adGroupScopeMatches(prepared, scope)) && (!draft || draft.phase === "failed");
  function refresh(fresh: boolean) {
    if (session.current?.locked || busy) return;
    setPrepared(null); setBusy(true);
    setReload((value) => ({ count: value.count + 1, fresh }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = session.current;
    if (!enabled || !prepared || !current || current.scopeKey !== scopeKey || current.locked) return;
    const validation = validateSearchAdFields(fields, parseDailyBudget(fields.bid));
    setErrors(validation.errors);
    if (!validation.searchAd) return;
    current.locked = true;
    setBusy(true); setPrepared(null); setResult(null); setError("");
    const active = () => !current.controller.signal.aborted && session.current === current;
    try {
      const existing = readDraft(storageKey, scope);
      if (existing && existing.phase !== "failed") throw new AdGroupApiError("GOOGLE_ADS_AD_GROUP_RESULT_UNKNOWN");
      const intent: AdGroupDraft = { schema: 1, scope: { ...scope, campaignName: prepared.campaignName }, phase: "ready", input: {
        requestId: crypto.randomUUID(), version: prepared.version, searchAd: validation.searchAd,
      } };
      const save = (value: AdGroupDraft) => {
        if (!active()) return;
        persistDraft(storageKey, value);
        setDraft(value);
      };
      const outcome = await submitAdGroup(intent, adGroupApi(workspace.id, scope), save, current.controller.signal);
      if (!active()) return;
      setDraft(outcome.draft); setResult(outcome.result); setError(outcome.error);
    } catch (cause) {
      if (!active()) return;
      setStorageBlocked(true);
      setError(cause instanceof AdGroupApiError ? cause.message : adGroupErrorMessage("CAMPAIGN_STORAGE_UNAVAILABLE"));
    } finally {
      if (active()) { current.locked = false; setBusy(false); }
    }
  }

  return <form className="mt-6 border-t border-[#e9e2da] pt-5" onSubmit={submit} aria-label="기존 캠페인에 광고 내용 추가" aria-busy={waiting}>
    <h3 className="text-base font-bold">광고 내용 추가</h3>
    <p className="mt-2 break-words text-sm">{(currentScope ? prepared?.campaignName : null) ?? visibleResult?.campaignName ?? scope.campaignName} · 캠페인 {scope.campaignId} · {scope.currency}</p>
    <p className="mt-2 text-sm leading-6 text-[#657080]">캠페인은 일시중지 상태를 유지합니다. 새 광고그룹·검색광고·키워드도 일시중지 상태로 추가됩니다. 캠페인 이름과 예산은 변경하지 않습니다.</p>
    {waiting ? <p role="status" className="mt-4 text-sm text-[#657080]">{visibleDraft ? "저장된 요청 결과를 확인하고 있습니다." : "광고 내용을 추가할 수 있는지 확인하고 있습니다."}</p> : null}
    {!canManage ? <p role="status" className="mt-4 text-sm text-[#657080]">현재 계정 또는 워크스페이스 권한으로는 광고 내용을 추가할 수 없습니다.</p> : null}
    {visibleDraft ? <p role="status" className="mt-4 break-all text-sm">{phaseLabel[visibleDraft.phase]} · 요청 {visibleDraft.input.requestId}</p> : null}
    {visibleDraft && visibleDraft.scope.campaignName !== (visibleResult?.campaignName ?? prepared?.campaignName ?? scope.campaignName) ? <p className="mt-2 break-words text-sm text-[#657080]">요청 당시 캠페인 이름: {visibleDraft.scope.campaignName}</p> : null}
    {currentScope && error ? <p role="alert" className="mt-4 break-words text-sm leading-6 text-[#a23428]">{error}</p> : null}
    {visibleResult?.status === "created" ? <section className="mt-5 text-sm" aria-label="추가된 광고 리소스">
      <p>광고그룹 {visibleResult.adGroupId}</p>
      <p className="mt-2 break-all">{visibleResult.adResourceName}</p>
      <ul className="mt-2 space-y-1">{visibleResult.keywordResourceNames.map((name) => <li key={name} className="break-all">{name}</li>)}</ul>
      <Link className={`${button} mt-4`} href={`/workspaces/${encodeURIComponent(workspace.id)}/campaigns?creationRequestId=${encodeURIComponent(visibleResult.managementId!)}`}>추가된 광고 조회·수정</Link>
    </section> : <GoogleAdsSearchAdFields fields={currentScope ? fields : emptyFields} setFields={setFields} errors={currentScope ? errors : {}} disabled={!enabled} currency={scope.currency} />}
    <div className="mt-6 flex flex-wrap gap-3">
      {enabled ? <button type="submit" className={`${button} bg-[#c04b24] text-white hover:bg-[#a83f1e]`}><Plus className="size-4" aria-hidden="true" />광고 내용 저장</button> : null}
      {!waiting && !enabled && visibleResult?.status !== "created" ? <button type="button" className={button} onClick={() => refresh(false)}><RefreshCw className="size-4" aria-hidden="true" />{visibleDraft ? "요청 상태 확인" : "다시 확인"}</button> : null}
      {!waiting && visibleDraft?.phase === "failed" && !prepared && canManage && !storageBlocked ? <button type="button" className={button} onClick={() => refresh(true)}><Plus className="size-4" aria-hidden="true" />새 요청 준비</button> : null}
      {waiting ? <LoaderCircle className="size-5 animate-spin text-[#657080]" aria-hidden="true" /> : null}
    </div>
  </form>;
}
