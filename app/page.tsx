import { Bell } from "lucide-react";

const navigation = [
  "대시보드",
  "캠페인 관리",
  "오디언스 타겟팅",
  "데이터 분석",
  "광고 인벤토리",
  "설정",
];

const metrics = [
  {
    label: "총 노출 수 (Impressions)",
    value: "1,248,500",
    change: "+12.4% vs 어제",
    trend: "up",
  },
  {
    label: "클릭 수 (Clicks)",
    value: "42,130",
    change: "+8.2% vs 어제",
    trend: "up",
  },
  {
    label: "평균 CTR (클릭률)",
    value: "3.37%",
    change: "-0.4% vs 어제",
    trend: "down",
  },
  {
    label: "총 광고 집행비 (Spend)",
    value: "$4,850.00",
    change: "+5.7% vs 어제",
    trend: "up",
  },
] as const;

const campaigns = [
  {
    name: "글로벌 타겟 디스플레이 Ad",
    status: "진행중",
    budget: "$2,500",
    conversion: "4.2%",
  },
  {
    name: "리타겟팅 동영상 캠페인",
    status: "진행중",
    budget: "$1,200",
    conversion: "5.8%",
  },
  {
    name: "주말 특별 프로모션 배너",
    status: "일시정지",
    budget: "$800",
    conversion: "2.1%",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-700 lg:flex">
      <aside className="bg-slate-900 px-4 py-5 text-white lg:fixed lg:inset-y-0 lg:w-[260px] lg:px-6 lg:py-8">
        <div className="mb-5 lg:mb-12">
          <h2 className="text-2xl font-bold">
            Growdo<span className="text-indigo-500">Ads</span>
          </h2>
        </div>

        <nav
          aria-label="주요 메뉴"
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {navigation.map((item, index) => (
            <a
              key={item}
              href="#"
              aria-current={index === 0 ? "page" : undefined}
              className={`shrink-0 rounded-lg px-4 py-[0.8rem] text-[0.95rem] font-medium transition-colors duration-200 ${
                index === 0
                  ? "bg-indigo-500 text-white"
                  : "text-slate-400 hover:bg-indigo-500/15 hover:text-white"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 lg:ml-[260px]">
        <header className="flex min-h-[70px] items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-10 lg:py-0">
          <div className="min-w-0 flex-1">
            <label htmlFor="campaign-search" className="sr-only">
              캠페인 또는 단어 검색
            </label>
            <input
              id="campaign-search"
              type="search"
              placeholder="캠페인 또는 단어 검색..."
              className="w-full max-w-[300px] rounded-full border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:gap-5">
            <button
              type="button"
              aria-label="알림 보기"
              className="rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <Bell aria-hidden="true" className="size-5" />
            </button>
            <div
              aria-hidden="true"
              className="size-[38px] rounded-full bg-slate-300"
            />
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">
              Admin
            </span>
          </div>
        </header>

        <section className="flex flex-col gap-8 p-4 sm:p-6 lg:p-10">
          <div>
            <h1 className="mb-2 text-[1.75rem] font-bold text-slate-700">
              광고 퍼포먼스 실시간 현황
            </h1>
            <p className="text-slate-500">
              오늘의 주요 지표와 캠페인 활성 상태를 확인하세요.
            </p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
            {metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
              >
                <h2 className="mb-3 text-[0.85rem] font-medium text-slate-500">
                  {metric.label}
                </h2>
                <p className="mb-2 text-[1.8rem] font-bold leading-tight text-slate-900">
                  {metric.value}
                </p>
                <p
                  className={`text-xs font-semibold ${
                    metric.trend === "up" ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {metric.change}
                </p>
              </article>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.6fr_1.4fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="text-[1.1rem] font-semibold text-slate-700">
                  실시간 트래픽 추이 (ROAS 분석)
                </h2>
                <button
                  type="button"
                  className="shrink-0 text-[0.85rem] font-semibold text-indigo-500 transition-colors hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
                >
                  자세히 보기
                </button>
              </div>
              <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
                <p className="text-center text-sm text-slate-500">
                  실시간 차트 데이터 렌더링 영역 (Next.js/라이브러리 연동용)
                </p>
              </div>
            </section>

            <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="mb-6">
                <h2 className="text-[1.1rem] font-semibold text-slate-700">
                  활성 광고 캠페인
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="border-b border-slate-200 pb-3 font-medium">
                        캠페인명
                      </th>
                      <th className="border-b border-slate-200 pb-3 font-medium">
                        상태
                      </th>
                      <th className="border-b border-slate-200 pb-3 font-medium">
                        예산
                      </th>
                      <th className="border-b border-slate-200 pb-3 font-medium">
                        전환(CVR)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => (
                      <tr key={campaign.name}>
                        <td className="border-b border-slate-100 py-4 pr-4">
                          {campaign.name}
                        </td>
                        <td className="border-b border-slate-100 py-4 pr-4">
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                              campaign.status === "진행중"
                                ? "bg-emerald-50 text-emerald-500"
                                : "bg-amber-100 text-amber-500"
                            }`}
                          >
                            {campaign.status}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 py-4 pr-4">
                          {campaign.budget}
                        </td>
                        <td className="border-b border-slate-100 py-4">
                          {campaign.conversion}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
