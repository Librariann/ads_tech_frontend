"use client";

import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bell,
  CircleHelp,
  Clock3,
  FileText,
  Home,
  LoaderCircle,
  Megaphone,
  Plus,
  Settings,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Store,
  Target,
  WalletCards,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { PolicyLinks } from "@/components/public/site-frame";
import type { AuthUser } from "@/lib/auth/server";
import type { BillingPlan, Workspace } from "@/lib/workspaces/types";
import {
  deriveDashboardOverview,
  overviewWeekday,
} from "@/lib/integrations/dashboard-overview";
import {
  formatReportMicros,
  formatReportNumber,
  reportErrorMessage,
  reportPrimaryStatus,
  type GoogleAdsReport,
} from "@/lib/integrations/google-ads-report";
import styles from "./dashboard-overview.module.css";

export type DashboardOverviewProps = {
  report?: GoogleAdsReport;
  loading: boolean;
  error?: string;
  loginRequired?: boolean;
  workspace: Workspace;
  onRefresh: () => void;
  homeUser?: AuthUser;
  invitationsCount?: number;
  plan?: BillingPlan | null;
};

const campaignStatus: Record<string, string> = {
  ENABLED: "사용 설정",
  PAUSED: "일시중지",
  REMOVED: "삭제됨",
  UNKNOWN: "알 수 없음",
  UNSPECIFIED: "미지정",
};

const navigation = [
  { label: "홈", icon: Home, href: "#top", current: true },
  { label: "내 광고", icon: Megaphone, href: "#campaigns", current: false },
  { label: "성과 보기", icon: BarChart3, href: "#performance", current: false },
  { label: "주간 리포트", icon: FileText, href: "#report", current: false },
] as const;

export function DashboardOverview({
  report,
  loading,
  error,
  loginRequired,
  workspace,
  onRefresh,
  homeUser,
  invitationsCount = 0,
  plan,
}: DashboardOverviewProps) {
  const [selection, setSelection] = useState({
    workspaceId: workspace.id,
    currency: workspace.defaultCurrency,
  });
  const setupHref = `/workspaces/${encodeURIComponent(
    workspace.id,
  )}/advertising`;
  const settingsHref = `/workspaces/${encodeURIComponent(
    workspace.id,
  )}/settings`;
  const detailHref = `/dashboard/google-ads?workspaceId=${encodeURIComponent(
    workspace.id,
  )}`;
  const navigationItems = navigation.map((item) => ({
    ...item,
    href:
      item.label === "내 광고"
        ? `/workspaces/${encodeURIComponent(workspace.id)}/campaigns`
        : item.label === "성과 보기"
          ? detailHref
          : item.href,
  }));
  const userLabel =
    homeUser?.displayName?.trim() || homeUser?.email?.trim() || "사용자";
  const greetingName = userLabel;
  const userInitial = userLabel.charAt(0).toUpperCase();
  const reportAvailable =
    !loading &&
    !error &&
    !loginRequired &&
    report?.workspaceId === workspace.id;
  const currentReport = reportAvailable ? report : undefined;
  const overview =
    currentReport && currentReport.status !== "error"
      ? deriveDashboardOverview(
          currentReport,
          selection.workspaceId === workspace.id
            ? selection.currency
            : workspace.defaultCurrency,
        )
      : undefined;
  const summary = overview?.summary;
  const summaries = overview?.summaries ?? [];
  const campaigns = overview?.campaigns ?? [];
  const days = overview?.days ?? [];
  const maxClicks = Math.max(1, ...days.map((day) => day.clicks ?? 0));
  const noAccounts =
    currentReport?.status === "no_accounts" ||
    currentReport?.accounts.length === 0;
  const failed =
    currentReport?.accounts.filter((account) => account.status === "error") ??
    [];
  const hasError = Boolean(
    error || loginRequired || currentReport?.status === "error",
  );
  const unknown = !loading && !hasError && !currentReport;
  const status = loading
    ? {
        title: "광고 현황을 불러오고 있어요. 잠시만 기다려 주세요.",
        description: "연결 계정과 최근 30일 성과를 확인하고 있어요.",
        action: "불러오는 중",
        target: "setup",
      }
    : loginRequired
      ? {
          title: "다시 로그인해 주세요",
          description: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.",
          action: "다시 로그인",
          target: "login",
        }
      : hasError || unknown
        ? {
            title: unknown
              ? "광고 상태를 아직 확인하지 못했어요"
              : "광고 현황을 불러오지 못했어요",
            description: error || reportErrorMessage(),
            action: "다시 불러오기",
            target: "retry",
          }
        : noAccounts
          ? {
              title: "연결된 Google Ads 계정이 없어요",
              description:
                "광고계정을 연결하면 실제 광고비와 캠페인 성과를 확인할 수 있어요.",
              action: "광고계정 연결",
              target: "setup",
            }
          : overview!.status;
  const badgeText = loading
    ? "광고 상태 확인 중"
    : hasError || unknown
      ? "광고 상태 확인 필요"
      : noAccounts
        ? "광고계정 연결 필요"
        : failed.length
          ? "일부 계정 조회 실패"
          : overview?.allPaused
            ? "광고 일시중지"
            : "조회된 캠페인 상태를 확인해 주세요";
  const greetingText = loading
    ? "광고 현황을"
    : hasError || unknown
      ? "광고 연결 상태를"
      : noAccounts
        ? "첫 광고계정을"
        : "광고 현황을";
  const greetingEnd = loading
    ? "확인하고 있어요."
    : noAccounts
      ? "연결해 주세요."
      : "확인해 주세요.";
  const period = currentReport
    ? `${currentReport.dateFrom} ~ ${currentReport.dateTo}`
    : "최근 30일 · 조회 대기";
  const updatedAt =
    currentReport && Number.isFinite(Date.parse(currentReport.fetchedAt))
      ? new Intl.DateTimeFormat("ko-KR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: workspace.timezone || "Asia/Seoul",
        }).format(new Date(currentReport.fetchedAt))
      : "확인 중";
  const planPrice =
    plan && Number.isFinite(plan.priceAmount)
      ? `${plan.currency} ${new Intl.NumberFormat("ko-KR", {
          maximumFractionDigits: 2,
        }).format(plan.priceAmount)}`
      : "—";
  const proposalHref =
    status.target === "login"
      ? `/login?returnTo=${encodeURIComponent(
          `/dashboard?workspaceId=${workspace.id}`,
        )}`
      : status.target === "setup"
        ? setupHref
        : `${detailHref}#campaigns`;

  return (
    <div
      id="top"
      className={`${styles.overview} min-h-screen bg-[#faf8f5] text-[#18212f] lg:flex`}
    >
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#e9e2da] bg-[#fdfbf8] px-5 py-7 lg:flex">
        <Brand />

        <nav aria-label="주요 메뉴" className="mt-12 space-y-1.5">
          {navigationItems.map(({ label, icon: Icon, href, current }) => (
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
            href={setupHref}
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
              <p className="text-xs text-[#8a8179]">{workspace.name}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-24 lg:ml-[248px] lg:pb-0">
        <header className="sticky top-0 z-20 border-b border-[#ede6de]/90 bg-[#faf8f5]/95 px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <div className="mx-auto flex h-[68px] max-w-[1180px] items-center justify-between">
            <div className="[&>a>span:last-child]:hidden min-[480px]:[&>a>span:last-child]:inline lg:hidden">
              <Brand />
            </div>
            <p className="hidden items-center gap-2 text-sm text-[#756e67] lg:flex">
              <Clock3 aria-hidden="true" className="size-4" />
              마지막 업데이트: {updatedAt}
            </p>
            <div className="flex items-center gap-2">
              {[
                { href: setupHref, label: "광고계정 연결", icon: Plus },
                {
                  href: settingsHref,
                  label: "워크스페이스 설정",
                  icon: Settings,
                },
                ...(homeUser?.isPlatformAdmin
                  ? [
                      {
                        href: "/admin",
                        label: "플랫폼 관리",
                        icon: ShieldCheck,
                      },
                    ]
                  : []),
                {
                  href: "/invitations",
                  label:
                    invitationsCount > 0
                      ? `초대 알림 ${invitationsCount}개`
                      : "초대 알림",
                  icon: Bell,
                },
              ].map(({ href, label, icon: Icon }) =>
                loading && href === setupHref ? (
                  <span
                    key={href}
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center"
                  >
                    <Skeleton className="size-5" />
                  </span>
                ) : (
                  <a
                    key={href}
                    href={href}
                    title={label}
                    aria-label={label}
                    className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-[#596372] transition-colors hover:bg-[#f0ebe5] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a]"
                  >
                    <Icon aria-hidden="true" className="size-5" />
                    {href === "/invitations" && invitationsCount > 0 ? (
                      <span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-[#f26b3a] px-1 text-[10px] font-bold text-[#fff8f2]">
                        {invitationsCount}
                      </span>
                    ) : null}
                  </a>
                ),
              )}
              <div
                aria-hidden="true"
                className="hidden size-9 items-center justify-center rounded-full bg-[#18212f] text-sm font-bold text-[#fffaf4] min-[480px]:flex lg:hidden"
              >
                {userInitial}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12 lg:px-12 lg:py-14">
          <section className="dashboard-reveal flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#fff0d8] px-3 py-1.5 text-xs font-bold text-[#99550b]">
                <BadgeCheck aria-hidden="true" className="size-4" />
                {badgeText}
              </div>
              <h1 className="text-[32px] lg:text-[55px] font-black leading-[1.14] [word-break:keep-all] [overflow-wrap:anywhere] tracking-[0] text-[#18212f]">
                {greetingName}, {greetingText}
                <br className="hidden sm:block" /> {greetingEnd}
              </h1>
              <p className="mt-5 max-w-xl text-[1.02rem] leading-7 text-[#68717e]">
                {workspace.name}
                <br />
                Google Ads · {period}
              </p>
            </div>
            {loading ? (
              <Skeleton className="h-13 w-40 shrink-0 self-start lg:self-auto" />
            ) : (
              <a
                href={`/workspaces/${encodeURIComponent(workspace.id)}/campaigns/new`}
                className="group inline-flex h-13 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[#f26b3a] px-5 text-[0.95rem] font-bold text-[#fff8f2] shadow-[0_8px_24px_rgba(192,69,27,0.18)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#df582b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f26b3a] lg:self-auto"
              >
                <Plus aria-hidden="true" className="size-5" />
                캠페인 만들기
              </a>
            )}
          </section>

          <div className="dashboard-reveal dashboard-delay-1 mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.72fr)]">
            <section
              id="performance"
              aria-busy={loading}
              className="overflow-hidden rounded-[28px] bg-[#18212f] px-6 py-7 text-[#fffaf4] sm:px-8 sm:py-9"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className={loading ? "min-w-0 flex-1" : undefined}>
                  <p className="text-sm font-semibold text-[#b8c5d5]">
                    최근 30일 광고 결과
                  </p>
                  <p className="mt-3 text-[25px] lg:text-[38px] font-extrabold leading-tight tracking-[0]">
                    {loading ? (
                      <span aria-hidden="true">
                        <Skeleton
                          dark
                          className="h-7 w-48 max-w-full lg:h-10"
                        />
                        <br />
                        <Skeleton
                          dark
                          className="h-7 w-60 max-w-full lg:h-10"
                        />
                      </span>
                    ) : (
                      <>
                        광고 클릭{" "}
                        <span className="text-[#ff9b72]">
                          {formatReportNumber(summary?.totals.clicks ?? null)}회
                        </span>
                        <br />
                        {summary
                          ? "조회된 클릭 수예요."
                          : "성과 확인이 필요해요."}
                      </>
                    )}
                  </p>
                </div>
                {loading ? (
                  <Skeleton dark className="h-5 w-24 shrink-0" />
                ) : (
                  <a
                    href={`${detailHref}#performance`}
                    className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-[#ffd0bc] hover:text-[#fffaf4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9b72]"
                  >
                    자세한 성과
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </a>
                )}
              </div>

              <p className="mt-3 text-xs leading-5 text-[#9eacbd]">
                {loading ? <Skeleton dark className="h-3 w-40" /> : period}
              </p>
              {summaries.length > 1 ? (
                <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#b8c5d5]">
                  집계 통화
                  <select
                    aria-label="집계 통화"
                    value={summary?.currency ?? ""}
                    onChange={(event) =>
                      setSelection({
                        workspaceId: workspace.id,
                        currency: event.target.value,
                      })
                    }
                    className="rounded-md border border-[#344356] bg-[#18212f] p-2 text-[#fffaf4]"
                  >
                    {summaries.map((item) => (
                      <option key={item.currency} value={item.currency}>
                        {item.currency}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="mt-9 grid grid-cols-[1fr_auto] items-end gap-6">
                {loading ? (
                  <div aria-hidden="true" className="flex h-32 items-center">
                    <Skeleton dark className="h-full w-full" />
                  </div>
                ) : (
                  <div
                    role="img"
                    aria-label={`종료일 기준 최근 7일 일별 광고 클릭: ${
                      days.length
                        ? days
                            .map(
                              (day) =>
                                `${day.date} ${formatReportNumber(day.clicks)}회`,
                            )
                            .join(", ")
                        : "조회 대기"
                    }`}
                    className="flex h-32 items-end gap-2.5 sm:gap-4"
                  >
                    {(days.length
                      ? days
                      : Array.from({ length: 7 }, () => ({
                          date: "",
                          clicks: null,
                        }))
                    ).map((day, index) => (
                      <div
                        key={day.date || index}
                        title={
                          day.date
                            ? `${day.date} 클릭 ${formatReportNumber(
                                day.clicks,
                              )}회`
                            : "조회 대기"
                        }
                        className="flex h-full flex-1 items-end"
                      >
                        <div
                          className={`w-full rounded-t-md ${
                            index === 5 ? "bg-[#ff8a5b]" : "bg-[#344356]"
                          }`}
                          data-clicks={day.clicks ?? "unknown"}
                          style={{
                            height: `${
                              day.clicks !== null
                                ? (day.clicks / maxClicks) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="hidden border-l border-[#344356] pl-6 sm:block">
                  <p className="text-xs font-semibold text-[#9eacbd]">
                    조회 성공
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-[#8ee0bd]">
                    {loading ? (
                      <Skeleton dark className="h-8 w-12" />
                    ) : (
                      <>{overview ? overview.successful.length : "—"}개</>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[#9eacbd]">Google Ads 계정</p>
                </div>
              </div>
              <div className="mt-3 flex justify-between text-[0.68rem] font-semibold text-[#8795a8]">
                {loading
                  ? Array.from({ length: 7 }, (_, index) => (
                      <Skeleton key={index} dark className="h-3 w-7" />
                    ))
                  : days.map((day) => (
                      <time key={day.date} dateTime={day.date} title={day.date}>
                        {day.date.slice(5).replace("-", "/")}{" "}
                        {overviewWeekday(day.date)}
                      </time>
                    ))}
              </div>
              <p className="mt-3 text-[0.7rem] leading-5 text-[#9eacbd]">
                {loading ? (
                  <Skeleton dark className="h-3 w-52 max-w-full" />
                ) : !days.length ? (
                  "일별 클릭 조회 대기"
                ) : days.some((day) => day.clicks === null) ? (
                  "— 조회 기간 밖이거나 일별 데이터 없음"
                ) : (
                  "Google Ads에서 조회된 실제 일별 클릭"
                )}
                {summaries.length > 1
                  ? ` · ${summary?.currency} 계정만 집계`
                  : ""}
              </p>
            </section>

            <section className="rounded-[28px] border border-[#e7ded5] bg-[#fffdf9] p-6 sm:p-7">
              <div className="flex items-center gap-2 text-[#c04b24]">
                <Sparkles aria-hidden="true" className="size-5" />
                <p className="text-sm font-extrabold">오늘의 제안</p>
              </div>
              <h2
                role={loading ? "status" : undefined}
                aria-live={loading ? "polite" : undefined}
                className="mt-5 text-xl font-extrabold leading-7 tracking-[0] [word-break:keep-all] [overflow-wrap:anywhere]"
              >
                {loading ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className={`${styles.loadingSpinner} mb-3 size-5 text-[#c04b24]`}
                  />
                ) : null}
                {status.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#6e746f]">
                {loading ? (
                  <Skeleton className="h-4 w-full" />
                ) : (
                  <span role={hasError ? "alert" : "status"}>
                    {status.description}
                  </span>
                )}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                {loading ? (
                  <Skeleton className="h-10 w-32" />
                ) : (
                  <>
                    {status.target === "retry" ? (
                      <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#18212f] px-4 py-2 text-sm font-bold text-[#fffaf4] transition-colors hover:bg-[#2a3545] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] disabled:opacity-50"
                      >
                        <RefreshCw aria-hidden="true" className="size-4" />
                        {status.action}
                      </button>
                    ) : (
                      <a
                        href={proposalHref}
                        className="inline-flex min-h-10 items-center rounded-lg bg-[#18212f] px-4 py-2 text-sm font-bold text-[#fffaf4] transition-colors hover:bg-[#2a3545] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a]"
                      >
                        {status.action}
                      </a>
                    )}
                    <a
                      href={setupHref}
                      className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-semibold text-[#70777f] hover:bg-[#f5f0ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a]"
                    >
                      연결 확인
                    </a>
                  </>
                )}
              </div>
              {failed.length > 0 ? (
                <div className="mt-5 text-xs leading-5 text-[#99550b]">
                  <p>
                    일부 계정의 성과를 불러오지 못했어요. 조회 실패{" "}
                    {failed.length}개 제외 · 실패한 계정은 성과와 조회 계정
                    수에서 제외했어요.
                  </p>
                  {failed.map((account) => (
                    <p key={account.accountId}>
                      {account.name} · {reportErrorMessage(account.error?.code)}
                    </p>
                  ))}
                  {currentReport?.status === "partial" ? (
                    <button
                      type="button"
                      title="성과 다시 불러오기"
                      aria-label="성과 다시 불러오기"
                      onClick={onRefresh}
                      className="mt-2 inline-flex size-8 items-center justify-center rounded-lg hover:bg-[#f5f0ea]"
                    >
                      <RefreshCw aria-hidden="true" className="size-4" />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {overview && overview.testCount > 0 ? (
                <p className="mt-5 text-[0.7rem] leading-5 text-[#96908a]">
                  조회된 계정 데이터만으로 실제 광고 게재·과금을 확인할 수
                  없어요.
                </p>
              ) : null}
              <p className="mt-5 text-[0.7rem] leading-5 text-[#96908a]">
                이 화면에서 광고 예산이나 게재 상태를 변경하지 않아요.
              </p>
            </section>
          </div>

          <section
            id="details"
            aria-busy={loading}
            className="dashboard-reveal dashboard-delay-2 mt-10 border-y border-[#e7ded5] py-7"
          >
            <div className="grid gap-6 sm:grid-cols-3 sm:divide-x sm:divide-[#e7ded5]">
              <div className="sm:pr-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#7a746d]">
                  <WalletCards aria-hidden="true" className="size-4" />
                  최근 30일 광고비
                </div>
                <p className="mt-2 text-2xl font-extrabold tracking-[0]">
                  {loading ? (
                    <Skeleton className="h-8 w-36" />
                  ) : summary ? (
                    formatReportMicros(
                      summary.totals.costMicros,
                      summary.currency,
                    )
                  ) : (
                    "—"
                  )}
                </p>
                <p className="mt-1 text-xs text-[#89827b]">
                  {loading ? (
                    <Skeleton className="h-3 w-40" />
                  ) : summary ? (
                    `${summary.currency} · 조회 계정 ${summary.accountIds.length}개`
                  ) : (
                    "조회 가능한 성과 없음"
                  )}
                </p>
              </div>
              <div className="sm:px-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#7a746d]">
                  <Target aria-hidden="true" className="size-4" />
                  보고된 전환
                </div>
                <p className="mt-2 text-2xl font-extrabold tracking-[0]">
                  {loading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>
                      {formatReportNumber(summary?.totals.conversions ?? null)}
                      건
                    </>
                  )}
                </p>
                <p className="mt-1 text-xs text-[#218a62]">
                  {loading ? (
                    <Skeleton className="h-3 w-40" />
                  ) : summary ? (
                    `${summary.currency} 계정의 보고된 전환`
                  ) : (
                    "조회 가능한 성과 없음"
                  )}
                </p>
              </div>
              <div className="sm:pl-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#7a746d]">
                  <Store aria-hidden="true" className="size-4" />
                  GrowdoAds 이용료
                </div>
                <p className="mt-2 text-2xl font-extrabold tracking-[0]">
                  {loading && !plan ? (
                    <Skeleton className="h-8 w-36" />
                  ) : (
                    planPrice
                  )}
                </p>
                <p className="mt-1 text-xs text-[#89827b]">
                  {loading && !plan ? (
                    <Skeleton className="h-3 w-40" />
                  ) : plan ? (
                    `${plan.name} · ${
                      plan.billingInterval === "year" ? "연" : "월"
                    } 정가 · 실제 청구액 아님`
                  ) : (
                    <a
                      href={settingsHref}
                      className="underline underline-offset-4"
                    >
                      요금제 확인
                    </a>
                  )}
                </p>
              </div>
            </div>
          </section>

          <section
            id="campaigns"
            aria-busy={loading}
            className="dashboard-reveal dashboard-delay-3 mt-12 scroll-mt-24"
          >
            <div className="flex items-end justify-between gap-5">
              <div>
                <p className="text-sm font-bold text-[#c04b24]">내 광고</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[0] sm:text-[1.8rem]">
                  연결된 캠페인 현황
                </h2>
              </div>
              {loading ? (
                <span aria-hidden="true" className="hidden sm:inline-block">
                  <Skeleton className="h-5 w-20" />
                </span>
              ) : (
                <a
                  href={`${detailHref}#campaigns`}
                  className="hidden items-center gap-1 text-sm font-bold text-[#596372] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a] sm:inline-flex"
                >
                  모두 보기 <ArrowRight aria-hidden="true" className="size-4" />
                </a>
              )}
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-[#e7ded5] bg-[#fffdf9]">
              {loading ? (
                <div aria-hidden="true" className={styles.loadingCampaigns}>
                  <div className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6">
                    <div className="flex min-w-0 flex-col gap-2">
                      <Skeleton className="h-5 w-64 max-w-full" />
                      <Skeleton className="h-3 w-80 max-w-full" />
                      <Skeleton className="h-3 w-36 max-w-full" />
                    </div>
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="size-10" />
                  </div>
                </div>
              ) : campaigns.length ? (
                campaigns.map((campaign, index) => (
                  <article
                    key={`${campaign.account.accountId}:${campaign.id}`}
                    className={`grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-6 ${
                      index !== campaigns.length - 1
                        ? "border-b border-[#eee7df]"
                        : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 truncate font-bold">
                          {campaign.name}
                        </h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${
                            campaign.status === "ENABLED"
                              ? "bg-[#e7f4ed] text-[#176a4b]"
                              : "bg-[#fff0d8] text-[#99550b]"
                          }`}
                        >
                          {campaignStatus[campaign.status] ?? campaign.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[#8a8179]">
                        Google Ads · {campaign.account.name} ·{" "}
                        {campaign.account.customerId}
                        {" · "}
                        {campaign.budgetPeriod === "DAILY"
                          ? "일일 예산"
                          : "예산"}{" "}
                        {formatReportMicros(
                          campaign.budgetMicros,
                          campaign.account.currency,
                        )}
                        {campaign.budgetPeriod !== "DAILY"
                          ? " · 일일 예산 확인 불가"
                          : ""}
                      </p>
                      <p className="mt-1.5 text-xs text-[#8a8179]">
                        게재 상태:{" "}
                        {reportPrimaryStatus(campaign.primaryStatus) ||
                          "확인 불가"}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs font-semibold text-[#8a8179]">
                        최근 30일 전환
                      </p>
                      <p className="mt-1 text-sm font-extrabold">
                        {formatReportNumber(campaign.metrics.conversions)}건
                      </p>
                    </div>
                    <a
                      href={`/workspaces/${encodeURIComponent(workspace.id)}/campaigns?${new URLSearchParams({ accountId: campaign.account.accountId, campaignId: campaign.id })}`}
                      title={`${campaign.name} 자세히 보기`}
                      aria-label={`${campaign.name} 자세히 보기`}
                      className="inline-flex size-10 items-center justify-center justify-self-start rounded-full bg-[#f5f0ea] text-[#596372] transition-colors hover:bg-[#fee4d9] hover:text-[#b43c18] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] sm:justify-self-end"
                    >
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </a>
                  </article>
                ))
              ) : (
                <div className="px-5 py-5 text-sm leading-6 text-[#8a8179]">
                  <p>
                    {hasError || unknown
                      ? "캠페인 상태 확인이 필요해요."
                      : "조회된 캠페인이 없어요."}
                  </p>
                  <a
                    href={setupHref}
                    className="mt-2 inline-flex items-center gap-1 font-bold text-[#b43c18]"
                  >
                    광고계정 확인{" "}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </a>
                </div>
              )}
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
                <h2 className="font-extrabold">광고 성과 상세 확인</h2>
                <p className="mt-1.5 text-sm leading-6 text-[#726b64]">
                  연결된 Google Ads 계정의 기간별 성과와 캠페인별 결과를 상세
                  화면에서 확인하세요.
                </p>
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-5 w-28 shrink-0 self-start sm:self-auto" />
            ) : (
              <a
                href={detailHref}
                className="inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-bold text-[#b43c18] hover:text-[#832c12] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a] sm:self-auto"
              >
                상세 성과 보기{" "}
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            )}
          </section>
          <footer className="mt-10 border-t border-[#e7ded5] pt-6">
            <PolicyLinks />
          </footer>
          <div className="mt-5 flex justify-end lg:hidden">
            <LogoutButton />
          </div>
        </div>
      </main>

      <nav
        aria-label="모바일 주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#e7ded5] bg-[#fffdf9]/95 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden"
      >
        {navigationItems.map(({ label, icon: Icon, href, current }) => (
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

function Skeleton({
  className,
  dark = false,
}: {
  className: string;
  dark?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton}${dark ? ` ${styles.skeletonDark}` : ""} ${className}`}
    />
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
      <span className="text-[1.2rem] font-black tracking-[0]">
        Growdo<span className="text-[#f26b3a]">Ads</span>
      </span>
    </a>
  );
}
