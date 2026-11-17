import { campaignBudgetText, type CampaignDetails } from "@/lib/integrations/google-ads-campaign";
import type { SearchAd } from "@/lib/integrations/google-ads-search-ad";

const rows = "mt-3 divide-y divide-[#e9e2da] border-y border-[#e9e2da] text-sm [&>div]:grid [&>div]:gap-1 [&>div]:py-3 sm:[&>div]:grid-cols-[140px_minmax(0,1fr)] [&_dt]:text-[#657080] [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:whitespace-pre-wrap";
const statusLabel = (status: string) => ({ PAUSED: "일시중지", ENABLED: "사용 설정", REMOVED: "삭제됨", UNKNOWN: "알 수 없음", UNSPECIFIED: "미지정" })[status] ?? status;

export function SearchAdRequestSummary({ searchAd, currency }: { searchAd: SearchAd; currency?: string | null }) {
  return <section className="mt-6" aria-labelledby="search-ad-request-title">
    <h3 id="search-ad-request-title" className="text-base font-bold">요청한 광고 내용</h3>
    <dl className={rows}>
      <div><dt>광고그룹 이름</dt><dd>{searchAd.adGroupName}</dd></div>
      <div><dt>클릭당 입찰가</dt><dd>{currency ?? "통화 미확인"} {campaignBudgetText(searchAd.cpcBidMicros)}</dd></div>
      <div><dt>최종 도착 URL</dt><dd className="[overflow-wrap:anywhere]">{searchAd.finalUrl}</dd></div>
      <div><dt>광고 제목</dt><dd><ol className="space-y-2">{searchAd.headlines.map((text, i) => <li key={i}>{text}</li>)}</ol></dd></div>
      <div><dt>광고 설명</dt><dd><ol className="space-y-2">{searchAd.descriptions.map((text, i) => <li key={i}>{text}</li>)}</ol></dd></div>
      <div><dt>키워드</dt><dd>{searchAd.keywordMatchType === "EXACT" ? "일치검색 (EXACT)" : "구문검색 (PHRASE)"}<ul className="mt-2 space-y-1">{searchAd.keywords.map((text, i) => <li key={i}>{text}</li>)}</ul></dd></div>
    </dl>
  </section>;
}

export function GoogleAdsStoredDetails({ details, currency }: { details: CampaignDetails; currency?: string | null }) {
  return <section aria-labelledby="google-stored-title" className="mt-6">
    <h3 id="google-stored-title" className="text-base font-bold">Google 저장 내용</h3>
    <p className="mt-2 break-all text-sm text-[#657080]">조회 시각: {details.fetchedAt}</p>
    <dl className={rows}>
      <div><dt>광고그룹 상태</dt><dd>{statusLabel(details.adGroupStatus)}</dd></div>
      <div><dt>광고 상태</dt><dd>{statusLabel(details.adStatus)}</dd></div>
      <div><dt>클릭당 입찰가</dt><dd>{currency ?? "통화 미확인"} {campaignBudgetText(details.cpcBidMicros)}</dd></div>
      <div><dt>최종 도착 URL</dt><dd className="[overflow-wrap:anywhere]">{details.finalUrls.join("\n") || "없음"}</dd></div>
      <div><dt>광고 제목</dt><dd><ol className="space-y-2">{details.headlines.map((text, i) => <li key={i}>{text}</li>)}</ol></dd></div>
      <div><dt>광고 설명</dt><dd><ol className="space-y-2">{details.descriptions.map((text, i) => <li key={i}>{text}</li>)}</ol></dd></div>
      <div><dt>키워드</dt><dd><ul className="space-y-3">{details.keywords.map((keyword) => <li key={keyword.resourceName}>
        <span className="block">{keyword.text}</span>
        <span className="text-[#657080]">{keyword.matchType} · {statusLabel(keyword.status)}</span>
        <span className="mt-1 block break-all text-xs text-[#657080]">{keyword.resourceName}</span>
      </li>)}</ul></dd></div>
      <div><dt>캠페인 ID</dt><dd>{details.campaignId}</dd></div>
      <div><dt>광고그룹 ID</dt><dd>{details.adGroupId}</dd></div>
      <div><dt>광고 리소스</dt><dd className="break-all">{details.adResourceName}</dd></div>
    </dl>
  </section>;
}
