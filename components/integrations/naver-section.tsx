"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react";
import {
  canManageNaver, formatNaverInteger, formatNaverMoney, formatNaverTime, NaverApiError,
  naverAccountInput, naverDateError, naverRequest, naverToday,
  parseNaverAccounts, parseNaverConfiguration, parseNaverReport,
  type NaverAccount, type NaverConfiguration, type NaverReport,
} from "@/lib/integrations/naver";

type Snapshot = { configuration: NaverConfiguration; accounts: NaverAccount[] };
const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d5dadd] px-4 text-sm font-semibold text-[#176a4b] disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass = "mt-2 min-h-11 w-full min-w-0 rounded-md border border-[#d5dadd] bg-white px-3 text-sm disabled:opacity-50";
const errorText = (error: unknown) => error instanceof NaverApiError ? error.message : "네이버 검색광고 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function NaverSection({ workspaceId, role }: { workspaceId: string; role: string }) {
  const canManage = canManageNaver(role);
  const [version, setVersion] = useState(0);
  const key = `${workspaceId}:${version}`;
  const [result, setResult] = useState<{ key: string; data?: Snapshot; error?: string }>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const registration = useRef<AbortController | null>(null);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateError, setDateError] = useState("");
  const [period, setPeriod] = useState({ dateFrom: "", dateTo: "" });
  const [reportVersion, setReportVersion] = useState(0);
  const [reportResult, setReportResult] = useState<{ key: string; data?: NaverReport; error?: string }>();
  const data = result?.key === key ? result.data : undefined;
  const loading = result?.key !== key;
  const accounts = data?.accounts;
  const account = accounts?.find((a) => a.id === selectedAccount) ?? accounts?.[0];
  const accountId = account?.id ?? "";
  const reportKey = `${key}:${accountId}:${period.dateFrom}:${period.dateTo}:${reportVersion}`;
  const report = reportResult?.key === reportKey ? reportResult.data : undefined;
  const reportError = reportResult?.key === reportKey ? reportResult.error : undefined;
  const reportLoading = !!accountId && reportResult?.key !== reportKey;
  const configured = !!data?.configuration.configured;

  useEffect(() => () => registration.current?.abort(), [workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const configuration = parseNaverConfiguration(await naverRequest(workspaceId, "configuration", { signal: controller.signal }));
        if (!configuration) throw new NaverApiError(502);
        const accounts = configuration.configured
          ? parseNaverAccounts(await naverRequest(workspaceId, "accounts", { signal: controller.signal })) : [];
        if (!accounts) throw new NaverApiError(502);
        if (!controller.signal.aborted) setResult({ key, data: { configuration, accounts } });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: errorText(error) });
      }
    })();
    return () => controller.abort();
  }, [workspaceId, key]);

  useEffect(() => {
    if (!configured || !accountId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ accountId });
    if (period.dateFrom && period.dateTo) {
      query.set("dateFrom", period.dateFrom); query.set("dateTo", period.dateTo);
    }
    void naverRequest(workspaceId, `report?${query}`, { signal: controller.signal }).then((payload) => {
      const report = parseNaverReport(payload);
      if (!report || report.account.id !== accountId ||
        (period.dateFrom && (report.period.dateFrom !== period.dateFrom || report.period.dateTo !== period.dateTo))) throw new NaverApiError(502);
      if (!controller.signal.aborted) setReportResult({ key: reportKey, data: report });
    }).catch((error) => {
      if (!controller.signal.aborted) setReportResult({ key: reportKey, error: errorText(error) });
    });
    return () => controller.abort();
  }, [workspaceId, configured, accountId, period.dateFrom, period.dateTo, reportKey]);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !configured || registration.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input = naverAccountInput({ customerId: fields.get("customerId"), name: fields.get("name"), apiKey: fields.get("apiKey"), secretKey: fields.get("secretKey") });
    if (!input) { setActionError("고객 ID, 계정 이름과 인증 키 입력을 확인해 주세요."); return; }
    const controller = new AbortController();
    registration.current = controller;
    setBusy(true); setActionError(""); setNotice("");
    try {
      await naverRequest(workspaceId, "accounts", { method: "POST", signal: controller.signal, body: JSON.stringify(input) });
      if (controller.signal.aborted) return;
      form.reset();
      setNotice("네이버 검색광고 계정을 등록했습니다.");
      setVersion((value) => value + 1);
    } catch (error) {
      if (!controller.signal.aborted) setActionError(errorText(error));
    } finally {
      if (registration.current === controller) registration.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = naverDateError(dateFrom, dateTo);
    setDateError(error ?? "");
    if (error) return;
    setPeriod({ dateFrom, dateTo });
    setReportVersion((value) => value + 1);
  }

  return <section id="naver" aria-label="네이버 검색광고">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">연결 관리</h2>
      <div className="flex items-center gap-3">
        <Link href={`/workspaces/${workspaceId}/naver`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#657168]">일시중지 관리<ArrowRight className="size-4" aria-hidden="true" /></Link>
        <button type="button" title="상태 다시 확인" aria-label="상태 다시 확인" className={actionClass} disabled={loading || busy} onClick={() => { setActionError(""); setVersion((value) => value + 1); }}>
          <RefreshCw className="size-4" aria-hidden="true" /><span className="sr-only">상태 다시 확인</span>
        </button>
      </div>
    </div>
    {loading && <p role="status" className="flex items-center gap-2 py-7 text-sm"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />네이버 연결 상태를 확인하고 있습니다.</p>}
    {result?.key === key && result.error && <p role="alert" className="mt-4 text-sm leading-6 text-[#a23628]">{result.error}</p>}
    {data && !configured && <div className="py-5"><h3 className="font-bold">네이버 연결 설정이 아직 준비되지 않았습니다</h3>
      <p className="mt-2 text-sm leading-6 text-[#657168]">서비스 관리자에게 네이버 검색광고 연결 설정 완료를 요청해 주세요.</p></div>}
    {configured && <>
      {canManage ? <details open={!accounts?.length} className="border-b border-[#e2e5e7] py-5">
        <summary className="cursor-pointer text-sm font-semibold">광고계정 추가</summary>
        <form method="post" autoComplete="off" onSubmit={register} className="pt-2" aria-busy={busy}>
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold" htmlFor="naver-customer-id">네이버 검색광고 고객 ID (Customer ID)
            <input id="naver-customer-id" name="customerId" className={fieldClass} type="text" inputMode="numeric" pattern="[1-9][0-9]{0,14}" maxLength={15} required autoComplete="off" disabled={busy} />
          </label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="naver-account-name">계정 이름
            <input id="naver-account-name" name="name" className={fieldClass} type="text" maxLength={160} required autoComplete="off" disabled={busy} />
          </label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="naver-api-key">API 키 (액세스 라이선스)
            <input id="naver-api-key" name="apiKey" className={fieldClass} type="password" minLength={1} maxLength={512} required autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} />
          </label>
          <label className="min-w-0 text-sm font-semibold" htmlFor="naver-secret-key">Secret 키
            <input id="naver-secret-key" name="secretKey" className={fieldClass} type="password" minLength={1} maxLength={512} required autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy} />
          </label>
        </div>
        <button type="submit" className={`${actionClass} mt-5`} disabled={busy}>
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}계정 등록
        </button>
      </form></details> : <p className="mt-5 text-sm leading-6 text-[#657168]">광고계정 등록은 워크스페이스 소유자 또는 관리자에게 요청해 주세요.</p>}
      <div className="py-6">
        <h3 className="font-bold">등록된 광고계정</h3>
        {accounts?.length ? <ul className="mt-3 divide-y divide-[#e2e5e7]">{accounts.map((a) => <li key={a.id} className="py-3">
          <p className="break-words text-sm font-semibold">{a.name}</p>
          <p className="mt-1 break-words text-xs leading-6 text-[#657168]">고객 ID: {a.externalAccountId} · KRW · Asia/Seoul</p>
          <p className={`mt-1 text-xs ${a.status === "active" && a.connectionStatus === "active" ? "text-[#176a4b]" : "text-[#9b5a22]"}`}>{a.status === "active" && a.connectionStatus === "active" ? "등록됨" : "연결 확인 필요"}</p>
        </li>)}</ul> : <p className="mt-3 text-sm text-[#657168]">등록된 네이버 검색광고 계정이 없습니다.</p>}
      </div>
      {!!accounts?.length && <div className="border-t border-[#e2e5e7] py-6" aria-busy={reportLoading}>
        <h3 className="font-bold">캠페인 성과</h3>
        <label className="mt-4 block min-w-0 text-sm font-semibold" htmlFor="naver-report-account">광고계정
          <select id="naver-report-account" className={fieldClass} value={accountId} onChange={(event) => setSelectedAccount(event.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.externalAccountId}</option>)}
          </select>
        </label>
        <form onSubmit={applyPeriod} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-48 text-sm font-semibold" htmlFor="naver-date-from">조회 시작일 (선택)
            <input id="naver-date-from" type="date" max={naverToday()} className={fieldClass} value={dateFrom} aria-invalid={!!dateError} aria-describedby={dateError ? "naver-date-error" : undefined} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="min-w-0 flex-1 basis-48 text-sm font-semibold" htmlFor="naver-date-to">조회 종료일 (선택)
            <input id="naver-date-to" type="date" max={naverToday()} className={fieldClass} value={dateTo} aria-invalid={!!dateError} aria-describedby={dateError ? "naver-date-error" : undefined} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <button type="submit" className={actionClass} disabled={reportLoading}><Search className="size-4" aria-hidden="true" />조회</button>
          <button type="button" className={actionClass} disabled={reportLoading} onClick={() => {
            setDateFrom(""); setDateTo(""); setDateError(""); setPeriod({ dateFrom: "", dateTo: "" }); setReportVersion((value) => value + 1);
          }}><RefreshCw className="size-4" aria-hidden="true" />최근 30일</button>
        </form>
        {dateError && <p role="alert" id="naver-date-error" className="mt-3 text-sm text-[#a23628]">{dateError}</p>}
        {reportLoading && <p role="status" className="flex items-center gap-2 py-6 text-sm"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />캠페인 성과를 불러오고 있습니다.</p>}
        {reportError && <p role="alert" className="mt-4 text-sm leading-6 text-[#a23628]">{reportError}</p>}
        {report && <>
          <p className="mt-5 text-sm leading-6 text-[#657168]">{report.period.dateFrom} ~ {report.period.dateTo} · 한국 시간</p>
          <h4 className="mt-4 text-sm font-bold">조회된 캠페인 합계</h4>
          <dl className="mt-3 grid grid-cols-1 gap-4 border-y border-[#e2e5e7] py-4 sm:grid-cols-3">
            <div className="min-w-0"><dt className="text-xs text-[#657168]">노출</dt><dd className="mt-1 break-all text-base font-bold tabular-nums">{formatNaverInteger(report.totals.impressions)}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-[#657168]">클릭</dt><dd className="mt-1 break-all text-base font-bold tabular-nums">{formatNaverInteger(report.totals.clicks)}</dd></div>
            <div className="min-w-0"><dt className="text-xs text-[#657168]">광고비 (VAT 포함)</dt><dd className="mt-1 break-all text-base font-bold tabular-nums">{formatNaverMoney(report.totals.cost)}</dd></div>
          </dl>
          {report.campaigns.length ? <div role="region" aria-label="네이버 캠페인 성과 표" tabIndex={0} className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[660px] table-fixed text-left text-sm">
              <caption className="sr-only">네이버 검색광고 캠페인 성과 · 광고비는 KRW, VAT 포함</caption>
              <thead className="border-b border-[#e2e5e7] text-xs text-[#657168]"><tr>
                <th scope="col" className="w-44 px-2 py-3">캠페인</th><th scope="col" className="w-28 px-2 py-3">상태 / 유형</th>
                <th scope="col" className="px-2 py-3 text-right">일 예산</th><th scope="col" className="px-2 py-3 text-right">노출</th>
                <th scope="col" className="px-2 py-3 text-right">클릭</th><th scope="col" className="px-2 py-3 text-right">광고비 (VAT 포함)</th>
              </tr></thead>
              <tbody className="divide-y divide-[#e2e5e7]">{report.campaigns.map((c) => <tr key={c.id}>
                <th scope="row" className="break-words px-2 py-4 font-semibold">{c.name}<span className="mt-1 block break-all text-xs font-normal text-[#657168]">{c.id}</span></th>
                <td className="break-words px-2 py-4 text-xs leading-6">{c.status}<br />{c.campaignType}</td>
                <td className="break-all px-2 py-4 text-right tabular-nums">{formatNaverMoney(c.dailyBudget)}</td>
                <td className="break-all px-2 py-4 text-right tabular-nums">{formatNaverInteger(c.impressions)}</td>
                <td className="break-all px-2 py-4 text-right tabular-nums">{formatNaverInteger(c.clicks)}</td>
                <td className="break-all px-2 py-4 text-right tabular-nums">{formatNaverMoney(c.cost)}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="py-6 text-sm text-[#657168]">조회된 캠페인이 없습니다.</p>}
          <p className="mt-4 text-xs leading-6 text-[#657168]">조회 시각: {formatNaverTime(report.fetchedAt)} (한국 시간)</p>
        </>}
      </div>}
    </>}
    {actionError && <p role="alert" className="mt-4 text-sm leading-6 text-[#a23628]">{actionError}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-[#176a4b]">{notice}</p>}
  </section>;
}
