"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle, Pencil, Plus, RefreshCw, Save, X } from "lucide-react";
import { campaignAccounts, campaignBudgetText, canCreateCampaign, parseDailyBudget } from "@/lib/integrations/google-ads-campaign";
import {
  adUpdateInput, adUpdateStorageKey, managedCampaignApi, managedErrorMessage, ManagedApiError,
  initialAdSelection, initialCampaignSelection, managedCampaignOptions, managedDetailsMatch, managedReadonlyReason, managedSearchAdFields, parseAdUpdateDraft, recoverAdUpdate, removedKeywords,
  submitAdUpdate, updateIsTerminal, type AdUpdateDraft, type CampaignAds, type ManagedCampaign, type ManagedDetails,
} from "@/lib/integrations/google-ads-managed";
import { isGoogleAdsReport, presetReportDates, type ReportAccount } from "@/lib/integrations/google-ads-report";
import { assetIsPinned, validateSearchAdFields, type SearchAdFields } from "@/lib/integrations/google-ads-search-ad";
import type { Workspace } from "@/lib/workspaces/types";
import { campaignField, GoogleAdsSearchAdFields } from "./google-ads-search-ad-fields";
import { GoogleAdsStoredDetails } from "./google-ads-campaign-details";
import { GoogleAdsAdGroupCreateForm } from "./google-ads-ad-group-create-form";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d8d0c8] px-4 text-sm font-bold hover:bg-[#f3eee8] focus-visible:outline-2 focus-visible:outline-[#c04b24] disabled:cursor-not-allowed disabled:opacity-50";
const emptyFields: SearchAdFields = { adGroupName: "", bid: "", finalUrl: "", headlines: ["", "", ""], descriptions: ["", ""], keywords: "", keywordMatchType: "EXACT" };
const phaseLabel: Record<AdUpdateDraft["phase"], string> = { submitted: "수정 결과 확인 필요", applying: "수정 중", unknown: "수정 결과 미확인", applied: "수정 완료", failed: "수정 실패" };
const statusLabel = (status: string) => ({ PAUSED: "일시중지", ENABLED: "사용 설정", REMOVED: "삭제됨", UNKNOWN: "알 수 없음", UNSPECIFIED: "미지정" })[status] ?? status;

export function GoogleAdsCampaignManager({ workspace, userId, initialAccountId = "", initialCampaignId = "", initialCreationRequestId = "" }: {
  workspace: Workspace; userId: string; initialAccountId?: string; initialCampaignId?: string; initialCreationRequestId?: string;
}) {
  const [accounts, setAccounts] = useState<ReportAccount[]>([]);
  const [eligibleIds, setEligibleIds] = useState<string[]>([]);
  const [items, setItems] = useState<ManagedCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountId, setAccountId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [reload, setReload] = useState(0);
  const [linkedId, setLinkedId] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const dates = presetReportDates(7, workspace.timezone);
        const api = managedCampaignApi(workspace.id);
        const [response, managed] = await Promise.all([
          fetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/integrations/google-ads/report?${new URLSearchParams(dates)}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal }),
          api.list(controller.signal),
        ]);
        const report: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new ManagedApiError(undefined, response.status);
        if (!isGoogleAdsReport(report) || report.workspaceId !== workspace.id || report.status === "error") throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
        if (initialCreationRequestId && !managed.some((item) => item.creationRequestId.toLowerCase() === initialCreationRequestId.toLowerCase())) {
          const linked = await api.details(initialCreationRequestId, controller.signal);
          managed.push({ ...linked, customerId: linked.details.adResourceName.split("/")[1], adGroupId: linked.details.adGroupId });
        }
        if (!active) return;
        setAccounts(report.accounts);
        setEligibleIds(campaignAccounts(report).map((account) => account.accountId));
        setItems(managed);
        const selection = initialCampaignSelection(report.accounts, managed, initialAccountId, initialCampaignId, initialCreationRequestId);
        setAccountId(selection.accountId);
        setCampaignId(selection.campaignId);
        setLinkedId(initialCreationRequestId);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : managedErrorMessage()); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [workspace.id, workspace.timezone, initialAccountId, initialCampaignId, initialCreationRequestId, reload]);

  const account = accounts.find((item) => item.accountId === accountId);
  const available = managedCampaignOptions(accounts, items, accountId);
  const selectedCampaign = available.find((item) => item.id === campaignId);
  return <div className="max-w-3xl py-6" aria-busy={loading}>
    <div className="flex items-center justify-between gap-3">
      <label htmlFor="managed-account" className="text-sm font-bold">연결된 계정</label>
      <button type="button" className={button} title="계정 및 광고 다시 조회" aria-label="계정 및 광고 다시 조회" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /></button>
    </div>
    <select id="managed-account" name="connectedAccount" className={campaignField} value={accountId} disabled={loading || Boolean(error)} onChange={(event) => { setAccountId(event.target.value); setCampaignId(""); setLinkedId(""); }}>
      <option value="">{loading ? "계정 확인 중" : "계정 선택"}</option>
      {accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name} · {account.customerId} · {account.currency}</option>)}
    </select>
    <label htmlFor="managed-campaign" className="mt-6 block text-sm font-bold">캠페인</label>
    <select id="managed-campaign" className={campaignField} value={campaignId} disabled={loading || !accountId || Boolean(error) || !available.length} onChange={(event) => { setCampaignId(event.target.value); setLinkedId(""); }}>
      <option value="">캠페인 선택</option>
      {available.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
    </select>
    {loading ? <p role="status" className="mt-4 text-sm text-[#657080]">광고를 조회하고 있습니다.</p> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-[#a23428]">{error} <Link href={`/login?returnTo=${encodeURIComponent(`/workspaces/${workspace.id}/campaigns`)}`} className="underline">로그인 확인</Link></p> : null}
    {!loading && !error && !accounts.length ? <p role="status" className="mt-4 text-sm text-[#657080]">연결된 계정이 없습니다. <Link className="underline" href={`/workspaces/${workspace.id}/advertising`}>광고계정 연결</Link></p> : null}
    {!loading && !error && account?.status === "error" ? <p role="alert" className="mt-4 text-sm leading-6 text-[#a23428]">이 계정의 캠페인을 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.</p> : null}
    {!loading && !error && account?.status === "ok" && !available.length ? <p role="status" className="mt-4 text-sm leading-6 text-[#657080]">이 계정에는 조회된 캠페인이 없습니다.</p> : null}
    {!loading && !error && selectedCampaign && account ? <CampaignAdDiscovery key={`${userId}:${workspace.id}:${accountId}:${campaignId}`} workspace={workspace} userId={userId} account={account} campaignId={campaignId} initialCreationRequestId={linkedId} eligible={eligibleIds.includes(accountId)} /> : !selectedCampaign ? <GoogleAdsSearchAdFields fields={emptyFields} setFields={() => {}} errors={{}} disabled currency={account?.currency} /> : null}
  </div>;
}

export function CampaignAdDiscovery({ workspace, userId, account, campaignId, initialCreationRequestId, eligible }: {
  workspace: Workspace; userId: string; account: ReportAccount; campaignId: string; initialCreationRequestId: string; eligible: boolean;
}) {
  const [loaded, setLoaded] = useState<{ scope: string; value: CampaignAds } | null>(null);
  const [selection, setSelection] = useState({ adGroupId: "", adId: "" });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  const [adding, setAdding] = useState(false);
  const scope = `${workspace.id}:${account.accountId}:${account.customerId}:${account.currency}:${campaignId}`;
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setBusy(true); setLoaded(null); setSelection({ adGroupId: "", adId: "" }); setError(""); setAdding(false);
      try {
        const value = await managedCampaignApi(workspace.id).discover(account, campaignId, controller.signal);
        if (controller.signal.aborted || current !== generation.current) return;
        setLoaded({ scope, value });
        setSelection(initialAdSelection(value, initialCreationRequestId));
      } catch (cause) {
        if (!controller.signal.aborted && current === generation.current) setError(cause instanceof Error ? cause.message : managedErrorMessage());
      } finally { if (!controller.signal.aborted && current === generation.current) setBusy(false); }
    });
    return () => { controller.abort(); };
  }, [workspace.id, account, campaignId, scope, initialCreationRequestId, reload]);
  const value = loaded?.scope === scope ? loaded.value : null;
  const group = value?.adGroups.find((item) => item.id === selection.adGroupId);
  const ad = group?.ads.find((item) => item.id === selection.adId);
  const syncDetails = useCallback((latest: ManagedDetails) => {
    setLoaded((previous) => {
      if (!previous || previous.scope !== scope || latest.accountId !== account.accountId || latest.campaignId !== campaignId ||
        latest.details.adGroupId !== selection.adGroupId || latest.details.adResourceName !== `customers/${account.customerId}/adGroupAds/${selection.adGroupId}~${selection.adId}`) return previous;
      return { ...previous, value: { ...previous.value, campaignStatus: latest.details.campaignStatus,
        adGroups: previous.value.adGroups.map((item) => item.id !== selection.adGroupId ? item : {
          ...item, name: latest.details.adGroupName, status: latest.details.adGroupStatus, cpcBidMicros: latest.details.cpcBidMicros,
          keywords: [...latest.details.keywords.map((keyword) => ({ ...keyword, negative: false })), ...item.keywords.filter((keyword) => keyword.negative)],
          ads: item.ads.map((item) => item.id !== selection.adId ? item : { ...item, status: latest.details.adStatus,
            finalUrls: latest.details.finalUrls, headlines: latest.details.headlines, descriptions: latest.details.descriptions }),
        }),
      } };
    });
  }, [scope, account.accountId, account.customerId, campaignId, selection.adGroupId, selection.adId]);
  const supported = Boolean(ad?.management && ad.type === "RESPONSIVE_SEARCH_AD" && !ad.unsupportedReason);
  const paused = value && group && ad && [value.campaignStatus, group.status, ad.status, ...group.keywords.filter((item) => !item.negative).map((item) => item.status)].every((status) => status === "PAUSED");
  return <section className="mt-6" aria-label="캠페인 광고" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="min-w-0 break-words text-lg font-bold">{value?.campaignName ?? "광고그룹과 광고"}</h2>
      <button type="button" className={button} disabled={busy} title="광고그룹 및 광고 다시 조회" aria-label="광고그룹 및 광고 다시 조회" onClick={() => setReload((value) => value + 1)}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" /></button>
    </div>
    {value ? <p className="mt-2 text-sm text-[#657080]">{statusLabel(value.campaignStatus)} · 캠페인 {value.campaignId}</p> : null}
    <label htmlFor="discovered-ad-group" className="mt-5 block text-sm font-bold">광고그룹</label>
    <select id="discovered-ad-group" className={campaignField} value={value ? selection.adGroupId : ""} disabled={busy || !value?.adGroups.length} onChange={(event) => setSelection({ adGroupId: event.target.value, adId: "" })}>
      <option value="">광고그룹 선택</option>
      {value?.adGroups.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id} · {statusLabel(item.status)}</option>)}
    </select>
    <label htmlFor="discovered-ad" className="mt-5 block text-sm font-bold">광고</label>
    <select id="discovered-ad" className={campaignField} value={ad?.id ?? ""} disabled={busy || !group?.ads.length} onChange={(event) => setSelection((value) => ({ ...value, adId: event.target.value }))}>
      <option value="">광고 선택</option>
      {group?.ads.map((item) => <option key={item.id} value={item.id}>{item.headlines[0] || item.type} · {item.id} · {statusLabel(item.status)}</option>)}
    </select>
    {busy ? <p role="status" className="mt-4 text-sm text-[#657080]">Google 광고그룹과 광고를 조회하고 있습니다.</p> : null}
    {error ? <p role="alert" className="mt-4 break-words text-sm text-[#a23428]">{error}</p> : null}
    {value && !value.adGroups.length && !busy && !error ? <>
      <p role="status" className="mt-4 text-sm text-[#657080]">이 캠페인에는 광고그룹이 없습니다.</p>
      {adding ? <GoogleAdsAdGroupCreateForm key={`${userId}:${scope}`} workspace={workspace} userId={userId}
        scope={{ accountId: value.accountId, customerId: value.customerId, campaignId: value.campaignId, campaignName: value.campaignName, currency: value.currency }}
        eligible={eligible && account.status === "ok" && account.testAccount === true} /> :
        <button type="button" className={`${button} mt-4`} disabled={!eligible || account.status !== "ok" || account.testAccount !== true || !canCreateCampaign(workspace.role)} onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" />광고 내용 추가</button>}
    </> : null}
    {value && initialCreationRequestId && !initialAdSelection(value, initialCreationRequestId).adId ? <p role="status" className="mt-4 text-sm text-[#657080]">연결된 광고를 찾지 못했습니다. 광고그룹과 광고를 선택해 주세요.</p> : null}
    {group ? <section className="mt-6 border-y border-[#e9e2da] py-4" aria-label="광고그룹 저장 내용">
      <p className="break-words text-sm text-[#657080]">{group.type} · {statusLabel(group.status)} · 클릭당 입찰가: {group.cpcBidMicros === null ? "미설정" : `${value?.currency} ${campaignBudgetText(group.cpcBidMicros)}`}</p>
      <h3 className="mt-4 text-sm font-bold">키워드</h3>
      {group.keywords.length ? <ul className="mt-3 space-y-3 text-sm">{group.keywords.map((keyword) => <li key={keyword.resourceName} className="break-words">
        <span className="block">{keyword.negative ? "제외 키워드" : "키워드"}: {keyword.text}</span>
        <span className="text-[#657080]">{keyword.matchType} · {statusLabel(keyword.status)}</span>
        <span className="mt-1 block break-all text-xs text-[#657080]">{keyword.resourceName}</span>
      </li>)}</ul> : <p role="status" className="mt-2 text-sm text-[#657080]">이 광고그룹에는 키워드가 없습니다.</p>}
      {!group.ads.length ? <p role="status" className="mt-4 text-sm text-[#657080]">이 광고그룹에는 광고가 없습니다.</p> : null}
    </section> : null}
    {ad && supported && ad.management ? <ManagedCampaignEditor key={`${userId}:${workspace.id}:${ad.resourceName}:${ad.management.creationRequestId}`} workspace={workspace} userId={userId} campaign={ad.management} adResourceName={ad.resourceName} eligible={eligible} readonlyReason={paused ? "" : managedErrorMessage("GOOGLE_ADS_PAUSED_REQUIRED")} onDetails={syncDetails} /> : ad ? <section className="mt-6" aria-label="광고 저장 내용">
      <h3 className="text-base font-bold">광고 {ad.id}</h3>
      <p role="status" className="mt-3 break-words text-sm text-[#657080]">읽기 전용: {ad.unsupportedReason ?? "이 광고 유형 또는 구성은 현재 편집할 수 없습니다."}</p>
      <dl className="mt-4 space-y-3 text-sm [&_dd]:mt-1 [&_dd]:whitespace-pre-wrap [&_dd]:[overflow-wrap:anywhere] [&_dt]:text-[#657080]">
        <div><dt>광고 유형 · 상태</dt><dd>{ad.type} · {statusLabel(ad.status)}</dd></div>
        <div><dt>최종 도착 URL</dt><dd>{ad.finalUrls.join("\n") || "없음"}</dd></div>
        <div><dt>광고 제목</dt><dd>{ad.headlines.join("\n") || "없음"}</dd></div>
        <div><dt>광고 설명</dt><dd>{ad.descriptions.join("\n") || "없음"}</dd></div>
        <div><dt>광고 리소스</dt><dd>{ad.resourceName}</dd></div>
      </dl>
    </section> : null}
  </section>;
}

export function ManagedCampaignEditor({ workspace, userId, campaign, eligible, adResourceName, readonlyReason = "", onDetails }: { workspace: Workspace; userId: string; campaign: ManagedCampaign; eligible: boolean; adResourceName?: string; readonlyReason?: string; onDetails?: (details: ManagedDetails) => void }) {
  const [latest, setLatest] = useState<ManagedDetails | null>(null);
  const [fields, setFields] = useState<SearchAdFields>(emptyFields);
  const [draft, setDraft] = useState<AdUpdateDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const storageKey = adUpdateStorageKey(userId, workspace.id, campaign.creationRequestId);
  const saveDraft = useCallback((value: AdUpdateDraft) => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); }
    catch { throw new ManagedApiError("CAMPAIGN_STORAGE_UNAVAILABLE"); }
  }, [storageKey]);
  const readDraft = useCallback(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const value = parseAdUpdateDraft(raw, campaign.creationRequestId);
    if (!value) throw new ManagedApiError("CAMPAIGN_STORAGE_UNAVAILABLE");
    return value;
  }, [storageKey, campaign.creationRequestId]);

  const refresh = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    const current = ++generation.current;
    await Promise.resolve();
    if (current !== generation.current) return;
    setBusy(true); setEditing(false); setLatest(null); setConsent(false); setErrors({}); setError("");
    try {
      const api = managedCampaignApi(workspace.id);
      const stored = readDraft();
      if (stored) {
        const recovered = await recoverAdUpdate(stored, api, saveDraft);
        if (current !== generation.current) return;
        setDraft(recovered.draft); setError(recovered.error);
      } else { setDraft(null); }
      let value = await api.details(campaign.creationRequestId);
      if (value.pendingUpdate && value.pendingUpdate.requestId !== stored?.input.requestId) {
        const remote = await api.lookup(value.pendingUpdate.requestId);
        if (remote.creationRequestId !== campaign.creationRequestId) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
        if (remote.status === "applied" || remote.status === "failed") value = await api.details(campaign.creationRequestId);
      }
      if (current !== generation.current) return;
      if (!managedDetailsMatch(value, campaign, adResourceName)) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      setLatest(value); setFields(managedSearchAdFields(value) ?? emptyFields); setStorageBlocked(false);
      onDetails?.(value);
    } catch (cause) {
      if (current === generation.current) {
        setError(cause instanceof Error ? cause.message : managedErrorMessage());
        if (cause instanceof ManagedApiError && cause.code === "CAMPAIGN_STORAGE_UNAVAILABLE") setStorageBlocked(true);
      }
    } finally { if (current === generation.current) { lock.current = false; setBusy(false); } }
  }, [workspace.id, campaign, adResourceName, readDraft, saveDraft, onDetails]);

  useEffect(() => {
    const lifecycle = generation;
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) void refresh(); };
    window.addEventListener("storage", onStorage);
    return () => { active = false; lifecycle.current++; lock.current = false; window.removeEventListener("storage", onStorage); };
  }, [refresh, storageKey]);

  const pending = Boolean((draft && !updateIsTerminal(draft)) || latest?.pendingUpdate);
  const editReason = readonlyReason || (latest ? managedReadonlyReason(latest) : "");
  const editable = Boolean(latest && !editReason && eligible && canCreateCampaign(workspace.role) && !pending && !storageBlocked && !busy);
  const removed = latest ? removedKeywords(latest.details, fields) : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editable || !latest || lock.current) return;
    const validated = validateSearchAdFields(fields, parseDailyBudget(fields.bid));
    setErrors({ ...validated.errors, ...(removed.length && !consent ? { consent: "기존 키워드 제거에 동의해 주세요." } : {}) });
    if (!validated.searchAd || (removed.length && !consent)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const api = managedCampaignApi(workspace.id);
      const stored = readDraft();
      if (stored && (!updateIsTerminal(stored) || (draft && stored.input.requestId !== draft.input.requestId))) {
        const recovered = await recoverAdUpdate(stored, api, saveDraft);
        setDraft(recovered.draft); setEditing(false); setLatest(null);
        setError("다른 화면에서 저장된 요청을 확인했습니다. 최신 광고 내용을 다시 조회해 주세요.");
        return;
      }
      const input = adUpdateInput({ requestId: crypto.randomUUID(), version: latest.version, searchAd: validated.searchAd, keywordRemovalConsent: removed.length > 0 && consent });
      if (!input) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
      const intent: AdUpdateDraft = { schema: 1, creationRequestId: campaign.creationRequestId, input, phase: "submitted" };
      // Record the exact intent before POST. Read/recovery paths never submit it.
      saveDraft(intent); setDraft(intent);
      const outcome = await submitAdUpdate(intent, api, saveDraft);
      setDraft(outcome.draft); setError(outcome.error); setEditing(false); setConsent(false); setLatest(null);
      if (updateIsTerminal(outcome.draft)) {
        const value = await api.details(campaign.creationRequestId);
        if (!managedDetailsMatch(value, campaign, adResourceName)) throw new ManagedApiError("CAMPAIGN_RESPONSE_INVALID");
        setLatest(value); setFields(managedSearchAdFields(value) ?? emptyFields);
        onDetails?.(value);
      }
    } catch (cause) {
      setEditing(false); setLatest(null);
      setError(cause instanceof Error ? cause.message : managedErrorMessage());
      if (cause instanceof ManagedApiError && cause.code === "CAMPAIGN_STORAGE_UNAVAILABLE") setStorageBlocked(true);
    } finally { lock.current = false; setBusy(false); }
  }

  return <section className="mt-8 border-t border-[#e9e2da] pt-6" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="min-w-0 break-words text-lg font-bold">{latest?.name ?? campaign.name}</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => void refresh()} title="최신 내용 및 요청 상태 확인"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />다시 조회</button>
        {!editing ? <button type="button" className={button} disabled={!editable} title={editReason || undefined} onClick={() => { const fields = latest && editable ? managedSearchAdFields(latest) : null; if (fields) { setFields(fields); setEditing(true); setConsent(false); setErrors({}); } }}><Pencil className="size-4" aria-hidden="true" />수정</button> : null}
      </div>
    </div>
    {error ? <p role="alert" className="mt-4 break-words text-sm leading-6 text-[#a23428]">{error}</p> : null}
    {busy ? <p role="status" className="mt-4 text-sm text-[#657080]">Google 저장 내용과 수정 요청을 확인하고 있습니다.</p> : null}
    {draft ? <p role="status" className="mt-4 break-all text-sm text-[#657080]">{phaseLabel[draft.phase]} · 요청 ID: {draft.input.requestId}</p> : null}
    {pending ? <p role="status" className="mt-3 text-sm leading-6 text-[#8b471c]">처리 중이거나 결과가 확인되지 않은 수정 요청이 있습니다. 새 수정은 잠겨 있습니다.{latest?.pendingUpdate ? ` 요청 ID: ${latest.pendingUpdate.requestId}` : ""}</p> : null}
    {latest ? <>
      <dl className="mt-5 grid gap-4 border-y border-[#e9e2da] py-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[#657080]">캠페인 상태</dt><dd className="mt-1 font-semibold">{statusLabel(latest.details.campaignStatus)}</dd></div>
        <div><dt className="text-[#657080]">광고그룹 이름</dt><dd className="mt-1 break-words font-semibold">{latest.details.adGroupName}</dd></div>
      </dl>
      {latest.details.headlineAssets || latest.details.descriptionAssets ? <dl className="mt-4 space-y-2 text-sm [&_dd]:break-words [&_dt]:text-[#657080]">
        {([{ key: "headlineAssets", label: "광고 제목" }, { key: "descriptionAssets", label: "광고 설명" }] as const).flatMap(({ key, label }) => latest.details[key]?.filter(assetIsPinned).map((asset, index) => <div key={`${key}:${index}`}><dt>{label} 고정 위치: {asset.pinnedField}</dt><dd>{asset.text}</dd></div>) ?? [])}
      </dl> : null}
      {editReason ? <p role="status" className="mt-4 break-words text-sm leading-6 text-[#657080]">읽기 전용: {editReason}</p> : null}
      {!eligible ? <p role="status" className="mt-4 text-sm text-[#657080]">이 연결 계정은 현재 수정 대상이 아닙니다.</p> : null}
    </> : null}
    {editing ? <form onSubmit={(event) => void submit(event)} noValidate>
      <p className="mt-5 text-sm leading-6 text-[#657080]">광고그룹 이름·클릭당 입찰가·키워드 변경은 같은 광고그룹의 다른 광고에도 적용됩니다.</p>
      <GoogleAdsSearchAdFields fields={fields} setFields={(action) => { setFields(action); setConsent(false); }} errors={errors} disabled={!editable} currency={latest?.currency} headlineAssets={latest?.details.headlineAssets} descriptionAssets={latest?.details.descriptionAssets} />
      {removed.length ? <section className="mt-6 border-y border-[#d8d0c8] py-4" aria-labelledby="removed-keywords-title">
        <h3 id="removed-keywords-title" className="text-sm font-bold">제거되는 기존 키워드</h3>
        <ul className="mt-3 space-y-2 text-sm">{removed.map((keyword) => <li key={keyword.resourceName} className="break-words">{keyword.text} · {keyword.matchType}</li>)}</ul>
        <label className="mt-4 flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" name="keywordRemovalConsent" className="mt-1 size-5 shrink-0 accent-[#c04b24]" checked={consent} disabled={!editable} onChange={(event) => setConsent(event.target.checked)} />위 기존 키워드의 제거에 동의합니다.</label>
        {errors.consent ? <p role="alert" className="mt-2 text-sm text-[#a23428]">{errors.consent}</p> : null}
      </section> : null}
      <p className="mt-5 text-sm text-[#657080]">저장 후에도 캠페인·광고그룹·광고·일반 키워드는 일시중지 상태를 유지하며, 제외 키워드는 변경하지 않습니다.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={!editable || Boolean(removed.length && !consent)} className={`${button} bg-[#f26b3a] text-white hover:bg-[#df582b]`}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}저장</button>
        <button type="button" disabled={busy} className={button} onClick={() => { setEditing(false); setConsent(false); setErrors({}); if (latest) setFields(managedSearchAdFields(latest) ?? emptyFields); }}><X className="size-4" aria-hidden="true" />취소</button>
      </div>
    </form> : latest ? <GoogleAdsStoredDetails details={latest.details} currency={latest.currency} /> : <GoogleAdsSearchAdFields fields={fields} setFields={setFields} errors={{}} disabled currency={campaign.currency} />}
  </section>;
}
