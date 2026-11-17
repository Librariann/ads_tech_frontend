"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, FileSearch, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import {
  CampaignApiError,
  campaignAccounts,
  campaignApi,
  campaignBudgetText,
  campaignErrorMessage,
  campaignInput,
  campaignStorageKey,
  canCreateCampaign,
  canStartNewCampaign,
  parseCampaignDraft,
  parseDailyBudget,
  recoverCampaign,
  submitCampaign,
  type CampaignDraft,
  type CampaignRequestState,
  type CampaignDetails,
} from "@/lib/integrations/google-ads-campaign";
import { unsafeAdText, validateSearchAdFields, type SearchAdFields } from "@/lib/integrations/google-ads-search-ad";
import { campaignField, GoogleAdsSearchAdFields } from "./google-ads-search-ad-fields";
import { GoogleAdsStoredDetails, SearchAdRequestSummary } from "./google-ads-campaign-details";
import {
  isGoogleAdsReport,
  presetReportDates,
  reportErrorMessage,
  type ReportAccount,
} from "@/lib/integrations/google-ads-report";
import type { Workspace } from "@/lib/workspaces/types";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d8d0c8] px-4 text-sm font-bold transition-colors hover:bg-[#f3eee8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c04b24] disabled:cursor-not-allowed disabled:opacity-50";
const field = campaignField;
const phaseLabel: Record<CampaignDraft["phase"], string> = {
  submitted: "요청 결과 확인 필요", retryable: "요청 미조회", creating: "생성 중",
  unknown: "생성 결과 미확인", conflict: "요청 내용 충돌", created: "생성 완료 · 일시중지", failed: "생성 실패",
};
const emptySearchAdFields = (): SearchAdFields => ({
  adGroupName: "", bid: "", finalUrl: "", headlines: ["", "", ""],
  descriptions: ["", ""], keywords: "", keywordMatchType: "EXACT",
});

export function GoogleAdsCampaignForm({ workspace, userId }: { workspace: Workspace; userId: string }) {
  const [accounts, setAccounts] = useState<ReportAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [loginRequired, setLoginRequired] = useState(false);
  const [requestState, setRequestState] = useState<CampaignRequestState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [searchAdFields, setSearchAdFields] = useState(emptySearchAdFields);
  const [storedDetails, setStoredDetails] = useState<CampaignDetails | null>(null);
  const [detailsError, setDetailsError] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const busyLock = useRef(false);
  const key = campaignStorageKey(workspace.id, userId);
  const base = `/api/workspaces/${encodeURIComponent(workspace.id)}/integrations/google-ads`;
  const reportHref = `/dashboard/google-ads?workspaceId=${encodeURIComponent(workspace.id)}`;
  const homeHref = `/dashboard?workspaceId=${encodeURIComponent(workspace.id)}`;
  const canManage = canCreateCampaign(workspace.role);

  const saveDraft = useCallback((draft: CampaignDraft) => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
    } catch {
      throw new CampaignApiError("CAMPAIGN_STORAGE_UNAVAILABLE");
    }
  }, [key]);

  const readDraft = useCallback(() => {
    const stored = localStorage.getItem(key);
    if (stored === null) return null;
    const draft = parseCampaignDraft(stored);
    if (!draft) throw new Error("저장된 요청을 읽을 수 없습니다. 새 요청을 중단했습니다. 보고서와 기존 요청 ID를 확인해 주세요.");
    return draft;
  }, [key]);

  const readAccounts = useCallback(async (signal?: AbortSignal) => {
    const dates = presetReportDates(7, workspace.timezone);
    const response = await fetch(`${base}/report?${new URLSearchParams(dates)}`, {
      cache: "no-store", credentials: "same-origin", signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : undefined;
      throw new CampaignApiError(code, response.status);
    }
    if (!isGoogleAdsReport(payload) || payload.workspaceId !== workspace.id || payload.status === "error") {
      throw new Error(reportErrorMessage());
    }
    return campaignAccounts(payload);
  }, [base, workspace.id, workspace.timezone]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const api = campaignApi(workspace.id);
    async function restore() {
      try {
        const draft = readDraft();
        const recovered = draft ? await recoverCampaign(draft, api, saveDraft) : null;
        if (active) {
          setRequestState(recovered);
          setReady(true);
        }
      } catch (cause) {
        if (active) {
          setStorageBlocked(true);
          setError(cause instanceof Error ? cause.message : campaignErrorMessage("CAMPAIGN_STORAGE_UNAVAILABLE"));
        }
      }
    }
    async function load() {
      try {
        const available = await readAccounts(controller.signal);
        if (active) setAccounts(available);
      } catch (cause) {
        if (active) {
          setAccountsError(cause instanceof Error ? cause.message : reportErrorMessage());
          setLoginRequired(cause instanceof CampaignApiError && cause.status === 401 && cause.code !== "GOOGLE_ADS_REAUTH_REQUIRED");
        }
      } finally {
        if (active) setAccountsLoading(false);
      }
    }
    void restore();
    void load();
    return () => { active = false; controller.abort(); };
  }, [readAccounts, readDraft, saveDraft, workspace.id]);

  async function refreshAccounts() {
    if (accountsLoading) return;
    setAccountsLoading(true);
    setAccountsError("");
    try {
      setAccounts(await readAccounts());
      setLoginRequired(false);
    } catch (cause) {
      setAccounts([]);
      setAccountsError(cause instanceof Error ? cause.message : reportErrorMessage());
      setLoginRequired(cause instanceof CampaignApiError && cause.status === 401 && cause.code !== "GOOGLE_ADS_REAUTH_REQUIRED");
    } finally { setAccountsLoading(false); }
  }

  async function checkRequest() {
    if (!requestState || busyLock.current || storageBlocked) return;
    busyLock.current = true;
    setBusy(true);
    setError("");
    setStoredDetails(null);
    setDetailsError("");
    try {
      const draft = readDraft();
      if (!draft) throw new Error("저장된 요청이 변경되었습니다. 화면을 새로고침해 주세요.");
      setRequestState(await recoverCampaign(draft, campaignApi(workspace.id), saveDraft));
    } catch (cause) {
      setStorageBlocked(true);
      setError(cause instanceof Error ? cause.message : campaignErrorMessage());
    } finally { busyLock.current = false; setBusy(false); }
  }

  async function create(event?: FormEvent<HTMLFormElement>, retry = false) {
    event?.preventDefault();
    if (!canManage || !ready || storageBlocked || busyLock.current || accountsLoading || accountsError) return;
    setError("");
    const selected = accounts.find((item) => item.accountId === accountId);
    const dailyBudgetMicros = parseDailyBudget(budget);
    const validatedAd = validateSearchAdFields(searchAdFields, parseDailyBudget(searchAdFields.bid));
    if (!retry) {
      const errors: Record<string, string> = { ...validatedAd.errors };
      if (!selected) errors.accountId = "연결된 계정을 선택해 주세요.";
      if (!name.trim() || name.trim().length > 128 || unsafeAdText.test(name)) errors.name = "캠페인 이름은 특수 제어문자와 줄바꿈 없이 1~128자로 입력해 주세요.";
      if (!dailyBudgetMicros) errors.budget = "0보다 크고 1,000,000 이하인 금액을 소수점 6자리 이내로 입력해 주세요.";
      setFieldErrors(errors);
      if (Object.keys(errors).length) return;
    }
    busyLock.current = true;
    setBusy(true);
    try {
      // A second tab or a refreshed page must adopt the saved intent, never overwrite it.
      const stored = readDraft();
      const api = campaignApi(workspace.id);
      if (stored) {
        const recovered = await recoverCampaign(stored, api, saveDraft);
        setRequestState(recovered);
        if (!retry || recovered.draft.phase !== "retryable" || stored.input.requestId !== requestState?.draft.input.requestId) return;
        if (!accounts.some((item) => item.accountId === stored.input.accountId)) {
          setError(campaignErrorMessage("GOOGLE_ADS_TEST_ACCOUNT_REQUIRED"));
          return;
        }
        setRequestState(await submitCampaign(recovered.draft, api, saveDraft));
        return;
      }
      if (retry || requestState) throw new Error("저장된 요청이 변경되었습니다. 화면을 새로고침해 주세요.");
      const input = campaignInput({ requestId: crypto.randomUUID(), accountId, name, dailyBudgetMicros, searchAd: validatedAd.searchAd });
      if (!input) throw new Error("캠페인 입력을 확인해 주세요.");
      const draft: CampaignDraft = { version: 1, input, phase: "submitted" };
      setRequestState({ draft, result: null, error: "" });
      setRequestState(await submitCampaign(draft, api, saveDraft));
    } catch (cause) {
      setStorageBlocked(true);
      setError(cause instanceof Error ? cause.message : campaignErrorMessage());
    } finally { busyLock.current = false; setBusy(false); }
  }

  function newIntent() {
    if (!requestState || !canStartNewCampaign(requestState.draft) || busyLock.current || storageBlocked) return;
    try {
      const stored = readDraft();
      if (!stored || stored.input.requestId !== requestState.draft.input.requestId || !canStartNewCampaign(stored)) {
        throw new Error("저장된 요청이 변경되었습니다. 먼저 요청 상태를 확인해 주세요.");
      }
      localStorage.removeItem(key);
      setRequestState(null);
      setName("");
      setBudget("");
      setSearchAdFields(emptySearchAdFields());
      setStoredDetails(null);
      setDetailsError("");
      setError("");
      setFieldErrors({});
    } catch (cause) {
      setStorageBlocked(true);
      setError(cause instanceof Error ? cause.message : campaignErrorMessage("CAMPAIGN_STORAGE_UNAVAILABLE"));
    }
  }

  async function checkStoredDetails() {
    const result = requestState?.result;
    if (!requestState || requestState.draft.phase !== "created" || !result?.searchAd || busyLock.current) return;
    busyLock.current = true;
    setDetailsLoading(true);
    setDetailsError("");
    setStoredDetails(null);
    try {
      const details = await campaignApi(workspace.id).details(requestState.draft.input.requestId);
      if (details.campaignId !== result.campaignId || details.adGroupId !== result.adGroupId ||
        details.adResourceName !== result.adResourceName) throw new CampaignApiError("CAMPAIGN_RESPONSE_INVALID");
      setStoredDetails(details);
    } catch (cause) {
      setDetailsError(cause instanceof CampaignApiError && [404, 405, 501].includes(cause.status ?? 0)
        ? "Google 저장 내용 조회를 아직 사용할 수 없습니다. 생성 요청은 유지됩니다. 잠시 후 다시 확인해 주세요."
        : `Google 저장 내용을 확인하지 못했습니다. ${cause instanceof Error ? cause.message : campaignErrorMessage()}`);
    } finally { busyLock.current = false; setDetailsLoading(false); }
  }

  const selected = accounts.find((item) => item.accountId === accountId);
  const draft = requestState?.draft;
  const result = requestState?.result;
  const needsLogin = loginRequired || requestState?.loginRequired;
  const disabled = !ready || !canManage || storageBlocked || busy || detailsLoading || accountsLoading || Boolean(accountsError) || accounts.length === 0;
  const requestReportHref = draft ? `${reportHref}&accountId=${encodeURIComponent(draft.input.accountId)}#campaigns` : reportHref;

  return (
    <div className="py-7">
      <dl className="grid gap-x-8 gap-y-3 border-b border-[#e9e2da] pb-6 text-sm sm:grid-cols-2">
        <div><dt className="text-[#657080]">정치광고 여부</dt><dd className="mt-1 font-semibold">해당 없음</dd></div>
        <div><dt className="text-[#657080]">생성 설정</dt><dd className="mt-1 font-semibold">모두 일시중지</dd></div>
      </dl>
      {!ready && !storageBlocked ? <p role="status" className="py-6 text-sm text-[#657080]">저장된 요청을 확인하는 중입니다.</p> : null}
      {error ? <p role="alert" className="my-5 break-words text-sm leading-6 text-[#a23428]">{error}</p> : null}
      {accountsError ? <p role="alert" className="my-5 break-words text-sm leading-6 text-[#a23428]">{accountsError}</p> : null}
      {needsLogin ? <Link href={`/login?returnTo=${encodeURIComponent(`/workspaces/${workspace.id}/campaigns/new`)}`} className={`${button} my-3`}>다시 로그인<ArrowRight className="size-4" aria-hidden="true" /></Link> : null}

      {draft ? (
        <section aria-labelledby="campaign-request-title" className="py-6" aria-busy={busy}>
          <h2 id="campaign-request-title" className="text-lg font-bold">{phaseLabel[draft.phase]}</h2>
          {!draft.input.searchAd ? <p className="mt-3 text-sm leading-6 text-[#657080]">기존 캠페인 전용 요청입니다. 광고그룹·광고·키워드는 생성하지 않은 요청입니다.</p> : <p className="mt-3 text-sm leading-6 text-[#657080]">캠페인·광고그룹·광고·키워드를 모두 일시중지로 생성하는 요청입니다.</p>}
          {requestState.error ? <p role="alert" className="mt-3 text-sm leading-6 text-[#a23428]">{requestState.error}</p> : null}
          {draft.phase === "unknown" ? <p role="status" className="mt-3 text-sm leading-6 text-[#8b471c]">중복 생성 방지를 위해 새 요청과 재전송이 잠겼습니다. 저장된 요청 상세와 보고서를 확인해 주세요.</p> : null}
          {result?.errorCode ? <p className="mt-3 break-words text-sm leading-6 text-[#a23428]">{campaignErrorMessage(result.errorCode)} <span className="break-all">({result.errorCode})</span></p> : null}
          <dl className="mt-5 divide-y divide-[#e9e2da] border-y border-[#e9e2da] text-sm [&>div]:grid [&>div]:gap-1 [&>div]:py-3 sm:[&>div]:grid-cols-[140px_minmax(0,1fr)] [&_dt]:text-[#657080] [&_dd]:min-w-0 [&_dd]:break-all">
            <div><dt>캠페인 이름</dt><dd>{result?.name ?? draft.input.name}</dd></div>
            <div><dt>연결 계정</dt><dd>{accounts.find((item) => item.accountId === (result?.accountId ?? draft.input.accountId))?.name ?? "Google Ads"} · {result?.customerId || accounts.find((item) => item.accountId === draft.input.accountId)?.customerId || "조회 대기"}</dd></div>
            <div><dt>일일 예산</dt><dd>{result?.currency ?? accounts.find((item) => item.accountId === draft.input.accountId)?.currency ?? "통화 미확인"} {campaignBudgetText(result?.dailyBudgetMicros ?? draft.input.dailyBudgetMicros)}</dd></div>
          </dl>
          {draft.input.searchAd ? <SearchAdRequestSummary searchAd={draft.input.searchAd} currency={result?.currency ?? accounts.find((item) => item.accountId === draft.input.accountId)?.currency} /> : null}
          <details className="mt-3 border-b border-[#e9e2da] text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold text-[#657080] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c04b24]">요청 상세 및 식별자</summary>
            <dl className="divide-y divide-[#e9e2da] pb-3 [&>div]:grid [&>div]:gap-1 [&>div]:py-3 sm:[&>div]:grid-cols-[140px_minmax(0,1fr)] [&_dt]:text-[#657080] [&_dd]:min-w-0 [&_dd]:break-all">
              <div><dt>요청 ID</dt><dd>{draft.input.requestId}</dd></div>
              <div><dt>연결 계정 ID</dt><dd>{result?.accountId ?? draft.input.accountId}</dd></div>
              <div><dt>Google 고객 ID</dt><dd>{result?.customerId || "조회 대기"}</dd></div>
              <div><dt>캠페인 ID</dt><dd>{result?.campaignId ?? "조회 대기"}</dd></div>
              <div><dt>예산 micros</dt><dd>{result?.dailyBudgetMicros ?? draft.input.dailyBudgetMicros}</dd></div>
              <div><dt>예산 리소스</dt><dd>{result?.budgetResourceName ?? "조회 대기"}</dd></div>
              <div><dt>광고그룹 ID</dt><dd>{result?.adGroupId ?? (draft.input.searchAd ? "조회 대기" : "생성 대상 아님")}</dd></div>
              <div><dt>광고 리소스</dt><dd>{result?.adResourceName ?? (draft.input.searchAd ? "조회 대기" : "생성 대상 아님")}</dd></div>
              <div><dt>키워드 리소스</dt><dd>{result?.keywordResourceNames.join("\n") || (draft.input.searchAd ? "조회 대기" : "생성 대상 아님")}</dd></div>
              <div><dt>생성 시각</dt><dd>{result?.createdAt ?? "조회 대기"}</dd></div>
              <div><dt>최종 확인 시각</dt><dd>{result?.updatedAt ?? "조회 대기"}</dd></div>
            </dl>
          </details>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className={button} disabled={busy || detailsLoading || storageBlocked} onClick={() => void checkRequest()}>
              <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />요청 상태 확인
            </button>
            {draft.phase === "retryable" ? <button type="button" className={button} disabled={disabled || !accounts.some((item) => item.accountId === draft.input.accountId)} onClick={() => void create(undefined, true)}>
              <RefreshCw className="size-4" aria-hidden="true" />같은 요청으로 다시 전송
            </button> : null}
            {draft.phase === "created" && result?.searchAd ? <button type="button" className={button} disabled={busy || detailsLoading} onClick={() => void checkStoredDetails()}>
              {detailsLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileSearch className="size-4" aria-hidden="true" />}Google 저장 내용 확인
            </button> : null}
            {draft.phase === "created" && result?.searchAd ? <Link className={button} href={`/workspaces/${workspace.id}/campaigns?creationRequestId=${encodeURIComponent(draft.input.requestId)}`}><FileSearch className="size-4" aria-hidden="true" />광고 조회 및 수정</Link> : null}
            {canStartNewCampaign(draft) ? <button type="button" className={button} disabled={busy || detailsLoading || storageBlocked} onClick={newIntent}>
              <Plus className="size-4" aria-hidden="true" />새 캠페인 작성
            </button> : null}
          </div>
          {detailsLoading ? <p role="status" className="mt-4 text-sm text-[#657080]">Google 저장 내용을 조회하고 있습니다.</p> : null}
          {detailsError ? <p role="alert" className="mt-4 text-sm leading-6 text-[#a23428]">{detailsError}</p> : null}
          {storedDetails ? <GoogleAdsStoredDetails details={storedDetails} currency={result?.currency} /> : null}
        </section>
      ) : ready ? (
        <form onSubmit={(event) => void create(event)} noValidate className="max-w-2xl py-6" aria-busy={busy}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="campaign-account" className="text-sm font-bold">연결된 계정</label>
            <button type="button" onClick={() => void refreshAccounts()} disabled={accountsLoading || busy} className="inline-flex size-10 items-center justify-center rounded-md text-[#657080] hover:bg-[#f3eee8] focus-visible:outline-2 focus-visible:outline-[#c04b24] disabled:opacity-50" aria-label="광고계정 상태 다시 확인" title="광고계정 상태 다시 확인">
              <RefreshCw className={`size-4 ${accountsLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
          <select id="campaign-account" name="connectedAccount" className={field} value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={disabled} required aria-invalid={Boolean(fieldErrors.accountId)} aria-describedby={fieldErrors.accountId ? "campaign-account-error" : undefined}>
            <option value="">{accountsLoading ? "계정 확인 중" : "계정 선택"}</option>
            {accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.name} · {account.customerId} · {account.currency}</option>)}
          </select>
          {fieldErrors.accountId ? <p id="campaign-account-error" role="alert" className="mt-2 text-sm text-[#a23428]">{fieldErrors.accountId}</p> : null}
          {!accountsLoading && !accountsError && !accounts.length ? <div role="status" className="mt-3 text-sm leading-6 text-[#657080]">
            <p>사용 가능한 연결 계정이 없습니다.</p>
            <Link href={`/workspaces/${workspace.id}/advertising`} className="mt-2 inline-flex min-h-10 items-center gap-2 font-bold text-[#b43c18]">광고계정 확인<ArrowRight className="size-4" aria-hidden="true" /></Link>
          </div> : null}
          <label htmlFor="campaign-name" className="mt-6 block text-sm font-bold">캠페인 이름</label>
          <input id="campaign-name" name="campaignName" className={field} value={name} onChange={(event) => setName(event.target.value)} maxLength={128} disabled={disabled || !selected} required autoComplete="off" aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "campaign-name-error" : undefined} />
          {fieldErrors.name ? <p id="campaign-name-error" role="alert" className="mt-2 text-sm text-[#a23428]">{fieldErrors.name}</p> : null}
          <label htmlFor="campaign-budget" className="mt-6 block text-sm font-bold">일일 예산{selected ? ` (${selected.currency})` : ""}</label>
          <input id="campaign-budget" name="dailyBudget" type="text" inputMode="decimal" className={field} value={budget} onChange={(event) => setBudget(event.target.value)} maxLength={14} disabled={disabled || !selected} required autoComplete="off" aria-invalid={Boolean(fieldErrors.budget)} aria-describedby={fieldErrors.budget ? "campaign-budget-error" : undefined} />
          {fieldErrors.budget ? <p id="campaign-budget-error" role="alert" className="mt-2 text-sm text-[#a23428]">{fieldErrors.budget}</p> : null}
          <GoogleAdsSearchAdFields fields={searchAdFields} setFields={setSearchAdFields} errors={fieldErrors} disabled={disabled || !selected} currency={selected?.currency} />
          <button type="submit" disabled={disabled || !selected} className={`${button} mt-7 border-transparent bg-[#f26b3a] text-[#fff8f2] hover:bg-[#df582b]`}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
            {busy ? "요청 중" : "캠페인 만들기"}
          </button>
        </form>
      ) : null}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#e9e2da] pt-5">
        <Link href={requestReportHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#b43c18]">
          <FileSearch className="size-4" aria-hidden="true" />상세 보고서 확인
        </Link>
        <Link href={homeHref} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#657080]">홈으로<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </footer>
    </div>
  );
}
