"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, LoaderCircle, RefreshCw, RotateCcw } from "lucide-react";
import { canManageNaver, formatNaverMoney, parseNaverAccounts, type NaverAccount } from "@/lib/integrations/naver";
import {
  editableNaverAdgroup, editableNaverCampaign, editableNaverKeyword, naverManagementError,
  parseManagedNaverAdgroups, parseManagedNaverCampaigns, parseManagedNaverKeywords, parseNaverChannels,
  type ManagedNaverCampaign, type ManagedNaverAdgroup, type ManagedNaverKeyword, type NaverAction, type NaverChannel,
} from "@/lib/integrations/naver-management";
import { NaverManagementForm, naverButton, naverField } from "./naver-management-form";
import { useNaverOperations, useNaverResource } from "./naver-management-state";

type Submit = (action: NaverAction, payload: Record<string, string>) => Promise<void>;
const readOnly = "활성 상태이거나 지원하지 않는 유형은 조회만 가능합니다. 변경하려면 WEB_SITE 캠페인·광고그룹과 대상 키워드가 모두 일시중지되어 있어야 합니다.";

export function NaverManagement({ workspaceId, userId, role }: { workspaceId: string; userId: string; role: string }) {
  // A keyed boundary prevents another tenant/user from inheriting selection or form state.
  return <NaverAccountPicker key={`${userId}:${workspaceId}`} workspaceId={workspaceId} userId={userId} role={role} />;
}
export function NaverAccountPicker({ workspaceId, userId, role }: { workspaceId: string; userId: string; role: string }) {
  const [revision, setRevision] = useState(0);
  const [accountId, setAccountId] = useState("");
  const accounts = useNaverResource(workspaceId, "accounts", parseNaverAccounts, String(revision), false);
  const account = accounts.data?.find((a) => a.id === accountId);
  return <>
    <div className="flex flex-wrap items-end gap-3 py-5">
      <label className="min-w-0 flex-1 text-sm font-semibold" htmlFor="naver-manage-account">광고계정
        <select id="naver-manage-account" className={naverField} disabled={!accounts.data?.length} value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">광고계정 선택</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.externalAccountId}</option>)}
        </select>
      </label>
      <button type="button" className={naverButton} disabled={accounts.loading} onClick={() => setRevision((v) => v + 1)}><RefreshCw className="size-4" aria-hidden="true" />계정 새로고침</button>
    </div>
    <LoadState loading={accounts.loading} error={accounts.error} />
    {accounts.data?.length === 0 ? <p className="py-4 text-sm">등록된 네이버 광고계정이 없습니다. <Link className="font-semibold text-[#176a4b] underline" href={`/workspaces/${workspaceId}/advertising?platform=naver`}>광고계정 연결</Link></p> : null}
    {!canManageNaver(role) ? <p className="pb-4 text-sm text-[#657168]">조회 전용 권한입니다. 변경은 워크스페이스 소유자 또는 관리자에게 요청해 주세요.</p> : null}
    {account ? <NaverAccountManagement key={`${userId}:${workspaceId}:${account.id}`} account={account} workspaceId={workspaceId} userId={userId} role={role} />
      : <NaverManagementForm action="create_campaign" accountId="" enabled={false} submit={async () => {}} />}
  </>;
}

export function NaverAccountManagement({ workspaceId, userId, account, role }: { workspaceId: string; userId: string; account: NaverAccount; role: string }) {
  const operations = useNaverOperations(userId, workspaceId, account.id);
  const [revision, setRevision] = useState(0);
  const [campaignId, setCampaignId] = useState("");
  const version = `${revision}:${operations.resourceVersion}`;
  const campaigns = useNaverResource(workspaceId, `campaigns?${new URLSearchParams({ accountId: account.id })}`, parseManagedNaverCampaigns, version);
  const channels = useNaverResource(workspaceId, `channels?${new URLSearchParams({ accountId: account.id })}`, parseNaverChannels, version);
  const campaign = campaigns.data?.find((c) => c.id === campaignId);
  const canWrite = operations.ready && canManageNaver(role) && account.status === "active" && account.connectionStatus === "active" && !!campaigns.data;
  const op = operations.recovery?.operation;
  const unresolved = !!operations.recovery?.intent && op?.status !== "failed" && op?.status !== "succeeded";
  return <div className="min-w-0">
    <section aria-label="변경 요청 상태" className="border-y border-[#dce3dd] py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">요청 상태</h2>
        <button type="button" className={naverButton} disabled={operations.loading} onClick={() => { operations.refresh(); setRevision((v) => v + 1); }}><RefreshCw className="size-4" aria-hidden="true" />상태 다시 확인</button>
      </div>
      <LoadState loading={operations.loading} error={operations.error} />
      {unresolved || operations.recovery?.pending ? <p role="status" className="mt-3 text-sm leading-6 text-[#88521a]">처리 중이거나 결과를 확인하지 못한 요청이 있습니다. 중복 변경을 막기 위해 새 요청이 잠겼습니다.</p> : null}
      {operations.recovery?.intent ? <p className="mt-2 break-all text-xs text-[#657168]">요청 ID: {operations.recovery.intent.requestId}</p> : null}
      {op?.status === "failed" ? <div className="mt-3 text-sm leading-6"><p role="alert">변경하지 못했습니다. {naverManagementError(op.errorCode ?? undefined)}</p>
        <button type="button" className={`${naverButton} mt-3`} disabled={operations.loading} onClick={operations.clearFailed}><RotateCcw className="size-4" aria-hidden="true" />실패 확인 후 새 요청 준비</button>
      </div> : null}
      {op?.status === "succeeded" ? <p role="status" className="mt-3 text-sm text-[#176a4b]">변경이 완료되었습니다.</p> : null}
      <Link href={`/workspaces/${workspaceId}/settings`} className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#176a4b]">워크스페이스 및 구독 확인<ArrowRight className="size-4" aria-hidden="true" /></Link>
    </section>
    {account.status !== "active" || account.connectionStatus !== "active" ? <p role="status" className="py-3 text-sm text-[#88521a]">연결이 활성 상태가 아니므로 광고 변경이 잠겼습니다. 광고계정 연결을 확인해 주세요.</p> : null}
    <section aria-labelledby="naver-campaign-heading" className="py-5">
      <h2 id="naver-campaign-heading" className="text-base font-bold">캠페인</h2>
      <LoadState loading={campaigns.loading} error={campaigns.error} />
      {campaigns.data ? <><ResourceTable label="캠페인 목록" rows={campaigns.data.map((c) => ({ ...c, type: c.campaignType, amount: c.dailyBudget }))} />
        <label className="mb-4 block min-w-0 text-sm font-semibold" htmlFor="naver-manage-campaign">캠페인 선택
          <select id="naver-manage-campaign" className={naverField} disabled={!campaigns.data.length} value={campaign?.id ?? ""} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">캠페인 선택</option>{campaigns.data.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
          </select>
        </label></> : null}
      <NaverManagementForm key={`create:${version}`} action="create_campaign" accountId={account.id} enabled={canWrite} submit={operations.submit} />
      {campaign ? <NaverCampaignManagement key={`${campaign.id}:${version}`} workspaceId={workspaceId} accountId={account.id} campaign={campaign}
        channels={channels.data} channelsLoading={channels.loading} channelsError={channels.error} enabled={canWrite} submit={operations.submit} version={version} /> : null}
    </section>
  </div>;
}

export function NaverCampaignManagement({ workspaceId, accountId, campaign, channels, channelsLoading, channelsError, enabled, submit, version }: {
  workspaceId: string; accountId: string; campaign: ManagedNaverCampaign; channels?: NaverChannel[]; channelsLoading: boolean; channelsError?: string; enabled: boolean; submit: Submit; version: string;
}) {
  const [adgroupId, setAdgroupId] = useState("");
  const groups = useNaverResource(workspaceId, `adgroups?${new URLSearchParams({ accountId, campaignId: campaign.id })}`, parseManagedNaverAdgroups, version);
  const validGroups = groups.data?.every((g) => g.campaignId === campaign.id) ? groups.data : undefined;
  const group = validGroups?.find((g) => g.id === adgroupId);
  const campaignEditable = editableNaverCampaign(campaign);
  const siteChannels = channels?.filter((c) => c.type === "SITE");
  return <>
    {!campaignEditable ? <p role="status" className="py-3 text-sm leading-6 text-[#657168]">{readOnly}</p> : null}
    <NaverManagementForm action="budget_campaign" accountId={accountId} context={{ campaignId: campaign.id }} initialAmount={campaign.dailyBudget ?? ""} enabled={enabled && campaignEditable} submit={submit} />
    <section aria-labelledby="naver-adgroup-heading" className="border-t border-[#dce3dd] pt-5">
      <h2 id="naver-adgroup-heading" className="text-base font-bold">광고그룹</h2>
      <LoadState loading={groups.loading} error={groups.error || (groups.data && !validGroups ? "선택한 캠페인의 광고그룹 응답을 확인하지 못했습니다." : undefined)} />
      {validGroups ? <><ResourceTable label="광고그룹 목록" rows={validGroups.map((g) => ({ ...g, type: g.adgroupType, amount: g.bidAmt }))} />
        <label className="mb-4 block min-w-0 text-sm font-semibold" htmlFor="naver-manage-adgroup">광고그룹 선택
          <select id="naver-manage-adgroup" className={naverField} disabled={!validGroups.length} value={group?.id ?? ""} onChange={(e) => setAdgroupId(e.target.value)}>
            <option value="">광고그룹 선택</option>{validGroups.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.status}</option>)}
          </select>
        </label></> : null}
      <LoadState loading={channelsLoading} error={channelsError} />
      {channels && siteChannels?.length === 0 ? <p role="status" className="py-3 text-sm leading-6 text-[#657168]">광고그룹 생성에는 등록된 SITE 비즈채널이 필요합니다. <a href="https://ads.naver.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#176a4b] underline">네이버 광고에서 비즈채널 확인<ExternalLink className="size-3" aria-hidden="true" /></a></p> : null}
      <NaverManagementForm action="create_adgroup" accountId={accountId} context={{ campaignId: campaign.id }} channels={siteChannels}
        enabled={enabled && campaignEditable && !!validGroups && !!siteChannels?.length} submit={submit} />
      {group ? <NaverAdgroupManagement key={`${group.id}:${version}`} workspaceId={workspaceId} accountId={accountId} campaign={campaign} group={group} enabled={enabled} submit={submit} version={version} /> : null}
    </section>
  </>;
}

export function NaverAdgroupManagement({ workspaceId, accountId, campaign, group, enabled, submit, version }: {
  workspaceId: string; accountId: string; campaign: ManagedNaverCampaign; group: ManagedNaverAdgroup; enabled: boolean; submit: Submit; version: string;
}) {
  const [keywordId, setKeywordId] = useState("");
  const keywords = useNaverResource(workspaceId, `keywords?${new URLSearchParams({ accountId, campaignId: campaign.id, adgroupId: group.id })}`, parseManagedNaverKeywords, version);
  const validKeywords = keywords.data?.every((k) => k.campaignId === campaign.id && k.adgroupId === group.id) ? keywords.data : undefined;
  const keyword = validKeywords?.find((k) => k.id === keywordId);
  const groupEditable = editableNaverAdgroup(campaign, group);
  const context = { campaignId: campaign.id, adgroupId: group.id };
  return <>
    {!groupEditable ? <p role="status" className="py-3 text-sm leading-6 text-[#657168]">{readOnly}</p> : null}
    <NaverManagementForm action="bid_adgroup" accountId={accountId} context={context} initialAmount={group.bidAmt} enabled={enabled && groupEditable} submit={submit} />
    <section aria-labelledby="naver-keyword-heading" className="border-t border-[#dce3dd] pt-5">
      <h2 id="naver-keyword-heading" className="text-base font-bold">키워드</h2>
      <LoadState loading={keywords.loading} error={keywords.error || (keywords.data && !validKeywords ? "선택한 광고그룹의 키워드 응답을 확인하지 못했습니다." : undefined)} />
      {validKeywords ? <><ResourceTable label="키워드 목록" rows={validKeywords.map((k) => ({ ...k, name: k.keyword, amount: k.bidAmt, groupBid: k.useGroupBidAmt }))} />
        <label className="mb-4 block min-w-0 text-sm font-semibold" htmlFor="naver-manage-keyword">키워드 선택
          <select id="naver-manage-keyword" className={naverField} disabled={!validKeywords.length} value={keyword?.id ?? ""} onChange={(e) => setKeywordId(e.target.value)}>
            <option value="">키워드 선택</option>{validKeywords.map((k) => <option key={k.id} value={k.id}>{k.keyword} · {k.status}</option>)}
          </select>
        </label></> : null}
      <NaverManagementForm action="create_keyword" accountId={accountId} context={context} enabled={enabled && groupEditable && !!validKeywords} submit={submit} />
      {keyword ? <KeywordBidForm key={keyword.id} accountId={accountId} campaign={campaign} group={group} keyword={keyword} enabled={enabled} submit={submit} /> : null}
    </section>
  </>;
}
function KeywordBidForm({ accountId, campaign, group, keyword, enabled, submit }: { accountId: string; campaign: ManagedNaverCampaign; group: ManagedNaverAdgroup; keyword: ManagedNaverKeyword; enabled: boolean; submit: Submit }) {
  return <>
    {!editableNaverKeyword(campaign, group, keyword) ? <p role="status" className="py-3 text-sm leading-6 text-[#657168]">{readOnly}</p> : null}
    {keyword.useGroupBidAmt ? <p className="py-3 text-sm text-[#657168]">현재 광고그룹 입찰가를 사용합니다.</p> : null}
    <NaverManagementForm action="bid_keyword" accountId={accountId} context={{ campaignId: campaign.id, adgroupId: group.id, keywordId: keyword.id }}
      initialAmount={keyword.bidAmt} enabled={enabled && editableNaverKeyword(campaign, group, keyword)} submit={submit} />
  </>;
}
function LoadState({ loading, error }: { loading: boolean; error?: string }) {
  return <>{loading ? <p role="status" className="flex items-center gap-2 py-3 text-sm text-[#657168]"><LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />현재 상태를 확인하고 있습니다.</p> : null}
    {error ? <p role="alert" className="break-words py-3 text-sm leading-6 text-[#a23628]">{error}</p> : null}</>;
}
function ResourceTable({ label, rows }: { label: string; rows: { id: string; name: string; status: string; type?: string; userLock: boolean; amount: string | null; groupBid?: boolean }[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-[#657168]">조회된 항목이 없습니다.</p>;
  return <div role="region" aria-label={label} tabIndex={0} className="my-4 overflow-x-auto">
    <table className="w-full min-w-[540px] table-fixed text-left text-sm"><caption className="sr-only">{label}</caption>
      <thead className="border-b border-[#dce3dd] text-xs text-[#657168]"><tr><th scope="col" className="w-2/5 px-2 py-3">이름</th><th scope="col" className="px-2 py-3">상태 / 유형</th><th scope="col" className="px-2 py-3 text-right">{label === "캠페인 목록" ? "일 예산" : "입찰가"}</th></tr></thead>
      <tbody className="divide-y divide-[#dce3dd]">{rows.map((r) => <tr key={r.id}>
        <th scope="row" className="break-words px-2 py-3 font-semibold">{r.name}<span className="mt-1 block break-all text-xs font-normal text-[#657168]">{r.id}</span></th>
        <td className="break-words px-2 py-3 text-xs leading-6">{r.status}{r.type ? ` / ${r.type}` : ""}<span className="block">{r.userLock ? "일시중지 설정" : "일시중지 미설정"}</span></td>
        <td className="break-all px-2 py-3 text-right tabular-nums">{formatNaverMoney(r.amount)}{r.groupBid ? <span className="mt-1 block text-xs text-[#657168]">그룹 입찰가 사용</span> : null}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
