"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import {
  formatMetaInteger, formatMetaMoney, formatMetaTime, isMetaAccounts, isMetaConfiguration,
  isMetaReport, MetaApiError, metaDateError, metaRequest, safeMetaMissingNames,
  type MetaAccount, type MetaConfiguration, type MetaReport,
} from "@/lib/integrations/meta";
import type { Workspace } from "@/lib/workspaces/types";
import styles from "./meta-report.module.css";

const statusLabels: Record<string, string> = { ACTIVE: "활성", PAUSED: "일시중지", DELETED: "삭제됨", ARCHIVED: "보관됨", IN_PROCESS: "처리 중", WITH_ISSUES: "문제 있음", CAMPAIGN_PAUSED: "캠페인 일시중지", ADSET_PAUSED: "광고 세트 일시중지" };
const objectiveLabels: Record<string, string> = { OUTCOME_TRAFFIC: "방문 유도", OUTCOME_AWARENESS: "인지도", OUTCOME_ENGAGEMENT: "참여", OUTCOME_LEADS: "잠재고객", OUTCOME_SALES: "매출", OUTCOME_APP_PROMOTION: "앱 홍보" };
const errorText = (error: unknown) => error instanceof MetaApiError ? error.message : "Meta 성과를 불러오지 못했습니다. 다시 시도해 주세요.";
type Setup = { configuration: MetaConfiguration; accounts: MetaAccount[] };

export function MetaReportDashboard({ workspace, workspaces }: { workspace: Workspace; workspaces: Workspace[] }) {
  const router = useRouter();
  const [reload, setReload] = useState(0);
  const setupKey = `${workspace.id}:${reload}`;
  const [setup, setSetup] = useState<{ key: string; data?: Setup; error?: string }>();
  const [accountId, setAccountId] = useState("");
  const [draft, setDraft] = useState({ dateFrom: "", dateTo: "" });
  const [range, setRange] = useState({ dateFrom: "", dateTo: "", version: 0 });
  const [dateError, setDateError] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; report?: MetaReport; error?: string }>();
  const data = setup?.key === setupKey ? setup.data : undefined;
  const accounts = data?.accounts.filter((account) => account.status === "active");
  const account = accounts?.find((a) => a.id === accountId) ?? accounts?.[0];
  const selectedId = account?.id ?? "";
  const reportKey = `${setupKey}:${selectedId}:${range.dateFrom}:${range.dateTo}:${range.version}`;
  const report = result?.key === reportKey ? result.report : undefined;
  const loading = setup?.key !== setupKey || (!!selectedId && result?.key !== reportKey);
  const setupHref = `/workspaces/${workspace.id}/advertising?platform=meta`;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const configuration = await metaRequest<unknown>(workspace.id, "configuration", { signal: controller.signal });
        if (!isMetaConfiguration(configuration)) throw new MetaApiError(502);
        const accounts = configuration.configured ? await metaRequest<unknown>(workspace.id, "accounts", { signal: controller.signal }) : [];
        if (!isMetaAccounts(accounts)) throw new MetaApiError(502);
        if (!controller.signal.aborted) setSetup({ key: setupKey, data: { configuration, accounts } });
      } catch (error) { if (!controller.signal.aborted) setSetup({ key: setupKey, error: errorText(error) }); }
    })();
    return () => controller.abort();
  }, [workspace.id, setupKey]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ accountId: selectedId });
    if (range.dateFrom && range.dateTo) { query.set("dateFrom", range.dateFrom); query.set("dateTo", range.dateTo); }
    void metaRequest<unknown>(workspace.id, `report?${query}`, { signal: controller.signal }).then((payload) => {
      if (!isMetaReport(payload) || payload.account.id !== selectedId ||
        (range.dateFrom && (payload.dateFrom !== range.dateFrom || payload.dateTo !== range.dateTo))) throw new MetaApiError(502);
      if (!controller.signal.aborted) setResult({ key: reportKey, report: payload });
    }).catch((error) => { if (!controller.signal.aborted) setResult({ key: reportKey, error: errorText(error) }); });
    return () => controller.abort();
  }, [workspace.id, selectedId, range.dateFrom, range.dateTo, reportKey]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const error = !draft.dateFrom && !draft.dateTo ? null : metaDateError(draft.dateFrom, draft.dateTo);
    setDateError(error);
    if (!error) setRange({ ...draft, version: range.version + 1 });
  }

  return <div aria-busy={loading}>
    <form className={styles.toolbar} onSubmit={submit}>
      <label className={styles.field}>워크스페이스<select value={workspace.id} onChange={(e) => router.push(`/dashboard/meta?workspaceId=${e.target.value}`)}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label className={styles.field}>Meta 광고계정<select value={selectedId} disabled={!accounts?.length} onChange={(e) => setAccountId(e.target.value)}>{!accounts?.length && <option value="">등록된 계정 없음</option>}{accounts?.map((a) => <option key={a.id} value={a.id}>{a.name || a.externalAccountId} · {a.currency}</option>)}</select></label>
      <label className={styles.field}>시작일<input type="date" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} aria-describedby={dateError ? "meta-date-error" : undefined} aria-invalid={!!dateError} /></label>
      <label className={styles.field}>종료일<input type="date" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} aria-describedby={dateError ? "meta-date-error" : undefined} aria-invalid={!!dateError} /></label>
      <button type="submit" disabled={loading || !selectedId} className={styles.button}><RefreshCw aria-hidden="true" />조회</button>
    </form>
    {dateError && <p id="meta-date-error" role="alert" className="mt-3 text-sm text-[#a23628]">{dateError}</p>}
    {loading && <p role="status" className={`${styles.state} flex items-center gap-2`}><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Meta 정보를 불러오고 있습니다.</p>}
    {setup?.key === setupKey && setup.error && <div role="alert" className={styles.state}><p>{setup.error}</p><button type="button" className={`${styles.button} mt-4`} onClick={() => setReload((v) => v + 1)}><RefreshCw aria-hidden="true" />다시 확인</button><Link href={setupHref} className="ml-4">Meta 연결 관리</Link></div>}
    {data && !data.configuration.configured && <section className={styles.state}>
      <h2>Meta 연결 설정이 아직 준비되지 않았습니다</h2><p className="mt-2">서비스 관리자에게 Meta 앱과 토큰 암호화 설정 완료를 요청해 주세요. Google Ads는 그대로 이용할 수 있습니다.</p>
      {!!safeMetaMissingNames(data.configuration.missing).length && <p className="mt-2 break-words text-xs">미설정 항목: {safeMetaMissingNames(data.configuration.missing).join(", ")}</p>}
      <Link href={setupHref}>Meta 연결 상태 확인</Link>
      <button type="button" className={`${styles.button} ml-4 mt-3`} onClick={() => setReload((v) => v + 1)}><RefreshCw aria-hidden="true" />다시 확인</button>
    </section>}
    {data?.configuration.configured && !accounts?.length && <section className={styles.state}><h2>등록된 Meta 광고계정이 없습니다</h2><p className="mt-2">워크스페이스 소유자 또는 관리자에게 Meta 연결과 광고계정 등록을 요청해 주세요.</p><Link href={setupHref}>Meta 광고계정 관리</Link></section>}
    {result?.key === reportKey && result.error && <section role="alert" className={styles.state}><p>{result.error}</p><button type="button" className={`${styles.button} mt-3`} onClick={() => setRange((v) => ({ ...v, version: v.version + 1 }))}><RefreshCw aria-hidden="true" />다시 조회</button><Link href={setupHref} className="ml-4">Meta 연결 관리</Link></section>}
    {report && <>
      <p className="mt-5 break-words text-sm leading-6 text-[#5c6863]">{report.account.name || report.account.externalAccountId} · {report.account.externalAccountId} · {report.account.currency} · {report.account.timezone}<br />{report.dateFrom} ~ {report.dateTo} · 가져온 시각: {formatMetaTime(report.fetchedAt)} (한국 시간)</p>
      <dl className={styles.totals}>{[
        ["광고비", formatMetaMoney(report.totals.spend, report.account.currency)], ["노출", formatMetaInteger(report.totals.impressions)],
        ["클릭", formatMetaInteger(report.totals.clicks)], ["도달", formatMetaInteger(report.totals.reach)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <MetaCampaigns key={reportKey} report={report} />
    </>}
  </div>;
}

function MetaCampaigns({ report }: { report: MetaReport }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const rows = report.campaigns.filter((c) => (!status || c.effectiveStatus === status) && `${c.name} ${c.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const current = Math.min(page, pages);
  return <section aria-labelledby="meta-campaigns-title" className="mt-7">
    <h2 id="meta-campaigns-title" className="text-lg font-bold">캠페인 <span className="text-sm font-normal">{report.campaigns.length}개</span></h2>
    <div className={`${styles.toolbar} mt-4`}>
      <label className={styles.field}>캠페인 검색<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="이름 또는 ID" /></label>
      <label className={styles.field}>게재 상태<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">전체 상태</option>{[...new Set(report.campaigns.map((c) => c.effectiveStatus))].map((s) => <option key={s} value={s}>{statusLabels[s] ?? s}</option>)}</select></label>
    </div>
    <div className={styles.scroll} role="region" tabIndex={0} aria-label="Meta 캠페인 성과 표"><table className={styles.table}>
      <caption className="sr-only">Meta 캠페인의 현재 상태와 선택 기간 성과. 광고비는 계정 통화 기준입니다.</caption>
      <thead><tr><th scope="col">캠페인</th><th scope="col">설정 / 게재 상태</th><th scope="col">목표</th>{["광고비", "노출", "클릭", "도달"].map((label) => <th key={label} scope="col" className={styles.numeric}>{label}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.slice((current - 1) * 25, current * 25).map((c) => <tr key={c.id}>
        <td>{c.name}<small>ID {c.id}</small></td><td>{statusLabels[c.status] ?? c.status}<small>{statusLabels[c.effectiveStatus] ?? c.effectiveStatus}</small></td><td>{objectiveLabels[c.objective] ?? (c.objective || "미제공")}</td>
        <td className={styles.numeric}>{formatMetaMoney(c.metrics.spend, report.account.currency)}</td><td className={styles.numeric}>{formatMetaInteger(c.metrics.impressions)}</td><td className={styles.numeric}>{formatMetaInteger(c.metrics.clicks)}</td><td className={styles.numeric}>{formatMetaInteger(c.metrics.reach)}</td>
      </tr>) : <tr><td colSpan={7} className="!py-10 text-center">{report.campaigns.length ? "검색 조건에 맞는 캠페인이 없습니다." : "조회된 캠페인이 없습니다."}</td></tr>}</tbody>
    </table></div>
    <div className={styles.pagination}><p>검색 결과 {rows.length}개</p><div><button type="button" className={styles.button} title="이전 페이지" aria-label="이전 페이지" disabled={current === 1} onClick={() => setPage(current - 1)}><ChevronLeft aria-hidden="true" /></button><span>{current} / {pages}</span><button type="button" className={styles.button} title="다음 페이지" aria-label="다음 페이지" disabled={current === pages} onClick={() => setPage(current + 1)}><ChevronRight aria-hidden="true" /></button></div></div>
  </section>;
}
