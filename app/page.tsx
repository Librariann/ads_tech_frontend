import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  CircleHelp,
  Clock3,
  FileText,
  Home,
  Megaphone,
  Plus,
  Sparkles,
  Settings2,
  Store,
  Target,
  WalletCards,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import {
  ACCESS_TOKEN_COOKIE,
  AuthBackendUnavailableError,
  type AuthUser,
  REFRESH_TOKEN_COOKIE,
  fetchAuthUser,
} from "@/lib/auth/server";
import { getWorkspaceInvitations } from "@/lib/workspaces/server";

const navigation = [
  { label: "홈", icon: Home, href: "#top", current: true },
  { label: "내 광고", icon: Megaphone, href: "#campaigns", current: false },
  { label: "성과 보기", icon: BarChart3, href: "#performance", current: false },
  { label: "주간 리포트", icon: FileText, href: "#report", current: false },
  {
    label: "설정",
    icon: Settings2,
    href: "/workspaces",
    current: false,
  },
] as const;

const dailyResults = [42, 58, 46, 72, 64, 86, 76] as const;

const campaigns = [
  {
    name: "우리 가게 알리기",
    platform: "네이버",
    status: "광고 중",
    result: "매장 확인 68명",
    budget: "하루 10,000원",
  },
  {
    name: "주말 신메뉴 홍보",
    platform: "Meta",
    status: "광고 중",
    result: "메뉴 보기 41명",
    budget: "하루 8,000원",
  },
  {
    name: "단골 고객 다시 만나기",
    platform: "Google",
    status: "검토 필요",
    result: "문의 15건",
    budget: "하루 6,000원",
  },
] as const;

export default async function HomePage() {
  const [user, invitations] = await Promise.all([
    getCurrentUser(),
    getWorkspaceInvitations("/"),
  ]);
  const userLabel = user.displayName || user.email || "TEST_USER";
  const greetingName = user.displayName?.trim() || "TEST_USER";
  const userInitial = userLabel.trim().charAt(0).toUpperCase();

  return (
    <div id="top" className="min-h-screen bg-[#faf8f5] text-[#18212f] lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#e9e2da] bg-[#fdfbf8] px-5 py-7 lg:flex">
        <Brand />

        <nav aria-label="주요 메뉴" className="mt-12 space-y-1.5">
          {navigation.map(({ label, icon: Icon, href, current }) => (
            <a
              key={label}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[0.94rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] ${
                current
                  ? "bg-[#feeae2] text-[#b43c18]"
                  : "text-[#657080] hover:bg-[#f4efe9] hover:text-[#18212f]"
              }`}
            >
              <Icon
                aria-hidden="true"
                className="size-[19px]"
                strokeWidth={2}
              />
              {label}
            </a>
          ))}
        </nav>

        <div className="mt-auto">
          <a
            href="#help"
            className="mb-5 block rounded-2xl bg-[#f3eee8] p-4 transition-colors hover:bg-[#eee6dd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a]"
          >
            <CircleHelp
              aria-hidden="true"
              className="mb-3 size-5 text-[#f26b3a]"
            />
            <p className="text-sm font-bold">광고가 어렵게 느껴지나요?</p>
            <p className="mt-1 text-xs leading-5 text-[#6f665f]">
              쉬운 설명으로 하나씩 도와드릴게요.
            </p>
          </a>

          <div className="flex items-center gap-3 border-t border-[#e9e2da] pt-5">
            <div
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#18212f] text-sm font-bold text-[#fffaf4]"
            >
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{userLabel}</p>
              <p className="text-xs text-[#8a8179]">내 워크스페이스</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-24 lg:ml-[248px] lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-[#ede6de]/90 bg-[#faf8f5]/95 px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <div className="mx-auto flex h-[68px] max-w-[1180px] items-center justify-between">
            <div className="lg:hidden">
              <Brand />
            </div>
            <p className="hidden items-center gap-2 text-sm text-[#756e67] lg:flex">
              <Clock3 aria-hidden="true" className="size-4" />
              마지막 업데이트: 오늘 오전 10:24
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/invitations"
                aria-label="알림 보기"
                title="알림"
                className="relative flex size-10 items-center justify-center rounded-full text-[#596372] transition-colors hover:bg-[#f0ebe5] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a]"
              >
                <Bell aria-hidden="true" className="size-5" />
                {invitations.length ? (
                  <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-[#f26b3a] text-[0.58rem] font-black text-[#fff8f2] ring-2 ring-[#faf8f5]">
                    {Math.min(invitations.length, 9)}
                  </span>
                ) : null}
              </Link>
              <div
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-[#18212f] text-sm font-bold text-[#fffaf4] lg:hidden"
              >
                {userInitial}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12 lg:py-14">
          <section className="dashboard-reveal flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#e7f4ed] px-3 py-1.5 text-xs font-bold text-[#176a4b]">
                <BadgeCheck aria-hidden="true" className="size-4" />
                모든 광고가 정상적으로 운영 중이에요
              </div>
              <h1 className="text-[clamp(2rem,4.6vw,3.45rem)] font-black leading-[1.14] tracking-[-0.045em] text-[#18212f]">
                {greetingName}님 오늘도 광고가
                <br className="hidden sm:block" /> 잘 일하고 있어요.
              </h1>
              <p className="mt-5 max-w-xl text-[1.02rem] leading-7 text-[#68717e]">
                어려운 숫자는 저희가 살펴볼게요. 사장님은 결과와 지금 할 일만
                확인하세요.
              </p>
            </div>
            <a
              href="#campaigns"
              className="group inline-flex h-13 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[#f26b3a] px-5 text-[0.95rem] font-bold text-[#fff8f2] shadow-[0_8px_24px_rgba(192,69,27,0.18)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#df582b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f26b3a] lg:self-auto"
            >
              <Plus aria-hidden="true" className="size-5" />새 광고 시작하기
            </a>
          </section>

          <div className="dashboard-reveal dashboard-delay-1 mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.72fr)]">
            <section
              id="performance"
              className="overflow-hidden rounded-[28px] bg-[#18212f] px-6 py-7 text-[#fffaf4] sm:px-8 sm:py-9"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#b8c5d5]">
                    이번 달 광고 결과
                  </p>
                  <p className="mt-3 text-[clamp(1.55rem,3vw,2.35rem)] font-extrabold leading-tight tracking-[-0.035em]">
                    광고를 통해 <span className="text-[#ff9b72]">124명</span>이
                    <br />
                    가게를 확인했어요.
                  </p>
                </div>
                <a
                  href="#details"
                  className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-[#ffd0bc] hover:text-[#fffaf4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9b72]"
                >
                  자세한 성과
                  <ArrowRight aria-hidden="true" className="size-4" />
                </a>
              </div>

              <div className="mt-9 grid grid-cols-[1fr_auto] items-end gap-6">
                <div
                  role="img"
                  aria-label="최근 7일 동안 광고를 통해 가게를 확인한 사람 수가 전반적으로 증가했습니다."
                  className="flex h-32 items-end gap-2.5 sm:gap-4"
                >
                  {dailyResults.map((height, index) => (
                    <div key={index} className="flex h-full flex-1 items-end">
                      <div
                        className={`w-full rounded-t-md ${
                          index === dailyResults.length - 2
                            ? "bg-[#ff8a5b]"
                            : "bg-[#344356]"
                        }`}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="hidden border-l border-[#344356] pl-6 sm:block">
                  <p className="text-xs font-semibold text-[#9eacbd]">
                    지난달보다
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-[#8ee0bd]">
                    +18%
                  </p>
                  <p className="mt-1 text-xs text-[#9eacbd]">더 많은 관심</p>
                </div>
              </div>
              <div className="mt-3 flex justify-between text-[0.68rem] font-semibold text-[#8795a8]">
                <span>월</span>
                <span>화</span>
                <span>수</span>
                <span>목</span>
                <span>금</span>
                <span>토</span>
                <span>일</span>
              </div>
            </section>

            <section className="rounded-[28px] border border-[#e7ded5] bg-[#fffdf9] p-6 sm:p-7">
              <div className="flex items-center gap-2 text-[#c04b24]">
                <Sparkles aria-hidden="true" className="size-5" />
                <p className="text-sm font-extrabold">오늘의 제안</p>
              </div>
              <h2 className="mt-5 text-xl font-extrabold leading-7 tracking-[-0.025em]">
                주말 광고 예산을 조금 늘려보세요.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#6e746f]">
                최근 2주 동안 토요일 방문 반응이 평일보다 34% 좋았어요. 하루
                3,000원을 더 쓰면 더 많은 고객에게 도달할 수 있어요.
              </p>
              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  className="h-10 rounded-lg bg-[#18212f] px-4 text-sm font-bold text-[#fffaf4] transition-colors hover:bg-[#2a3545] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a]"
                >
                  제안 살펴보기
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg px-3 text-sm font-semibold text-[#70777f] hover:bg-[#f5f0ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a]"
                >
                  나중에
                </button>
              </div>
              <p className="mt-5 text-[0.7rem] leading-5 text-[#96908a]">
                변경 전 내용을 다시 보여드리고, 승인 없이 광고를 바꾸지 않아요.
              </p>
            </section>
          </div>

          <section
            id="details"
            className="dashboard-reveal dashboard-delay-2 mt-10 border-y border-[#e7ded5] py-7"
          >
            <div className="grid gap-6 sm:grid-cols-3 sm:divide-x sm:divide-[#e7ded5]">
              <div className="sm:pr-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#7a746d]">
                  <WalletCards aria-hidden="true" className="size-4" />
                  이번 달 광고비
                </div>
                <p className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">
                  248,000원
                </p>
                <p className="mt-1 text-xs text-[#89827b]">
                  정한 예산의 62%를 사용했어요
                </p>
              </div>
              <div className="sm:px-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#7a746d]">
                  <Target aria-hidden="true" className="size-4" />
                  고객 행동
                </div>
                <p className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">
                  문의 15건
                </p>
                <p className="mt-1 text-xs text-[#218a62]">
                  지난달 같은 기간보다 4건 많아요
                </p>
              </div>
              <div className="sm:pl-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#7a746d]">
                  <Store aria-hidden="true" className="size-4" />
                  GrowdoAds 이용료
                </div>
                <p className="mt-2 text-2xl font-extrabold tracking-[-0.03em]">
                  29,000원
                </p>
                <p className="mt-1 text-xs text-[#89827b]">
                  광고비와 별도로 결제돼요
                </p>
              </div>
            </div>
          </section>

          <section
            id="campaigns"
            className="dashboard-reveal dashboard-delay-3 mt-12 scroll-mt-24"
          >
            <div className="flex items-end justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-[#c04b24]">내 광고</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] sm:text-[1.8rem]">
                  지금 운영 중인 광고예요
                </h2>
              </div>
              <a
                href="#campaigns"
                className="hidden items-center gap-1 text-sm font-bold text-[#596372] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a] sm:inline-flex"
              >
                모두 보기 <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-[#e7ded5] bg-[#fffdf9]">
              {campaigns.map((campaign, index) => (
                <article
                  key={campaign.name}
                  className={`grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6 ${
                    index !== campaigns.length - 1
                      ? "border-b border-[#eee7df]"
                      : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold">{campaign.name}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${
                          campaign.status === "광고 중"
                            ? "bg-[#e7f4ed] text-[#176a4b]"
                            : "bg-[#fff0d8] text-[#99550b]"
                        }`}
                      >
                        {campaign.status}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[#8a8179]">
                      {campaign.platform} · {campaign.budget}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-semibold text-[#8a8179]">
                      이번 달 결과
                    </p>
                    <p className="mt-1 text-sm font-extrabold">
                      {campaign.result}
                    </p>
                  </div>
                  <a
                    href="#campaigns"
                    aria-label={`${campaign.name} 자세히 보기`}
                    className="inline-flex size-10 items-center justify-center justify-self-start rounded-full bg-[#f5f0ea] text-[#596372] transition-colors hover:bg-[#fee4d9] hover:text-[#b43c18] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] sm:justify-self-end"
                  >
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section
            id="report"
            className="dashboard-reveal dashboard-delay-3 mt-10 flex flex-col gap-5 rounded-[24px] bg-[#f3eee8] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7"
          >
            <div className="flex gap-4">
              <FileText
                aria-hidden="true"
                className="mt-0.5 size-6 shrink-0 text-[#f26b3a]"
              />
              <div>
                <h2 className="font-extrabold">
                  이번 주 광고 결과가 준비됐어요
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-[#726b64]">
                  지난주와 달라진 점, 잘된 점, 다음 할 일을 쉬운 말로
                  정리했어요.
                </p>
              </div>
            </div>
            <a
              href="#report"
              className="inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-bold text-[#b43c18] hover:text-[#832c12] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a] sm:self-auto"
            >
              리포트 읽기 <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </section>
        </div>
      </main>

      <nav
        aria-label="모바일 주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[#e7ded5] bg-[#fffdf9]/95 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden"
      >
        {navigation.map(({ label, icon: Icon, href, current }) => (
          <a
            key={label}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-13 flex-col items-center justify-center gap-1 rounded-lg text-[0.67rem] font-bold focus-visible:outline-2 focus-visible:outline-[#f26b3a] ${
              current ? "text-[#c04b24]" : "text-[#7f7a75]"
            }`}
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <a
      href="#top"
      aria-label="GrowdoAds 홈"
      className="inline-flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f26b3a]"
    >
      <span
        aria-hidden="true"
        className="relative flex size-7 items-center justify-center"
      >
        <span className="absolute size-6 rotate-45 rounded-[7px] bg-[#f26b3a]" />
        <span className="relative size-2 rounded-full bg-[#fff8f2]" />
      </span>
      <span className="text-[1.2rem] font-black tracking-[-0.04em]">
        Growdo<span className="text-[#f26b3a]">Ads</span>
      </span>
    </a>
  );
}

async function getCurrentUser(): Promise<AuthUser> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    redirect(refreshToken ? "/api/auth/session?returnTo=/" : "/login");
  }

  let response: Response;
  try {
    response = await fetchAuthUser(accessToken);
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) {
      redirect("/login?error=backend");
    }
    throw error;
  }

  if (response.ok) {
    return (await response.json()) as AuthUser;
  }

  if (response.status === 401 && refreshToken) {
    redirect("/api/auth/session?returnTo=/");
  }

  redirect(
    response.status === 401 ? "/login?error=session" : "/login?error=backend",
  );
}
