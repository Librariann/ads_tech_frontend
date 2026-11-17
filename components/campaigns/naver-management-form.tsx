"use client";

import { useState, type FormEvent } from "react";
import { Plus, Save } from "lucide-react";
import { naverOperationInput, validNaverAmount, type NaverAction, type NaverChannel } from "@/lib/integrations/naver-management";

export const naverButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#b8c4bd] px-3 text-sm font-semibold text-[#176a4b] hover:bg-[#edf4ef] focus-visible:outline-2 focus-visible:outline-[#176a4b] disabled:cursor-not-allowed disabled:opacity-50";
export const naverField = "mt-1 min-h-11 w-full min-w-0 rounded-md border border-[#b8c4bd] bg-white px-3 text-sm text-[#202c24] disabled:cursor-not-allowed disabled:bg-[#edf0ee] disabled:text-[#737d76]";
const labels: Record<NaverAction, string> = { create_campaign: "캠페인 만들기", budget_campaign: "일 예산 저장", create_adgroup: "광고그룹 만들기", bid_adgroup: "그룹 입찰가 저장", create_keyword: "키워드 1개 추가", bid_keyword: "키워드 입찰가 저장" };

export function NaverManagementForm({ action, accountId, context = {}, initialAmount = "", channels = [], enabled, submit }: {
  action: NaverAction; accountId: string; context?: Record<string, string>; initialAmount?: string; channels?: NaverChannel[];
  enabled: boolean; submit: (action: NaverAction, payload: Record<string, string>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [money, setMoney] = useState(initialAmount);
  const [pcChannelId, setPcChannelId] = useState("");
  const [mobileChannelId, setMobileChannelId] = useState("");
  const [error, setError] = useState("");
  const creating = action.startsWith("create_");
  const budget = action === "create_campaign" || action === "budget_campaign";
  const keyword = action === "create_keyword";
  const channelFields = action === "create_adgroup";
  const id = `naver-${action}`;
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled) return;
    if (!validNaverAmount(money, budget)) { setError(budget ? "일 예산은 70~1,000,000,000원 사이의 10원 단위 숫자로 입력해 주세요." : "입찰가는 70~100,000원 사이의 10원 단위 숫자로 입력해 주세요."); return; }
    if (channelFields && (!channels.some((c) => c.id === pcChannelId && c.type === "SITE") || !channels.some((c) => c.id === mobileChannelId && c.type === "SITE"))) {
      setError("PC와 모바일 SITE 비즈채널을 각각 선택해 주세요."); return;
    }
    const payload = { ...context, [budget ? "dailyBudget" : "bidAmt"]: money,
      ...(creating ? { [keyword ? "keyword" : "name"]: name } : {}), ...(channelFields ? { pcChannelId, mobileChannelId } : {}) };
    const input = naverOperationInput({ requestId: "00000000-0000-4000-8000-000000000000", accountId, action, payload });
    if (!input) { setError(keyword ? "키워드는 제어문자 없이 1~25자로 입력해 주세요." : "이름은 제어문자 없이 1~50자로 입력해 주세요."); return; }
    setError(""); await submit(action, input.payload);
  }
  return <form onSubmit={onSubmit} aria-label={labels[action]} className="border-t border-[#dce3dd] py-4">
    <h3 className="text-sm font-bold">{labels[action]}</h3>
    <fieldset disabled={!enabled} className="mt-3 grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="sr-only">{labels[action]} 입력</legend>
      {creating ? <label className="min-w-0 text-sm font-medium" htmlFor={`${id}-name`}>{keyword ? "키워드" : "이름"}
        <input id={`${id}-name`} className={naverField} value={name} maxLength={keyword ? 25 : 50} required autoComplete="off" aria-describedby={error ? `${id}-error` : undefined} onChange={(e) => setName(e.target.value)} />
      </label> : null}
      <label className="min-w-0 text-sm font-medium" htmlFor={`${id}-amount`}>{budget ? "일 예산 (원)" : "입찰가 (원)"}
        <input id={`${id}-amount`} className={naverField} value={money} inputMode="numeric" pattern="[0-9]+" required autoComplete="off" aria-describedby={error ? `${id}-error` : undefined} onChange={(e) => setMoney(e.target.value)} />
      </label>
      {channelFields ? (["pc", "mobile"] as const).map((kind) => <label key={kind} className="min-w-0 text-sm font-medium" htmlFor={`${id}-${kind}`}>{kind === "pc" ? "PC 비즈채널" : "모바일 비즈채널"}
        <select id={`${id}-${kind}`} className={naverField} value={kind === "pc" ? pcChannelId : mobileChannelId} required onChange={(e) => (kind === "pc" ? setPcChannelId : setMobileChannelId)(e.target.value)}>
          <option value="">SITE 채널 선택</option>
          {channels.filter((c) => c.type === "SITE").map((c) => <option key={c.id} value={c.id}>{c.name}{c.url ? ` · ${c.url}` : ""} · {c.status}</option>)}
        </select>
      </label>) : null}
      <button type="submit" className={`${naverButton} justify-self-start`}>
        {creating ? <Plus className="size-4" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}{labels[action]}
      </button>
    </fieldset>
    {error ? <p role="alert" id={`${id}-error`} className="mt-3 text-sm leading-6 text-[#a23628]">{error}</p> : null}
  </form>;
}
