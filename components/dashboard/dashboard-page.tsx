import {
  BarChart3,
  Bell,
  Building2,
  CircleHelp,
  Home,
  Megaphone,
  Plus,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { GoogleAdsReportDashboard } from "@/components/dashboard/google-ads-report";
import { PolicyLinks } from "@/components/public/site-frame";
import {
  ACCESS_TOKEN_COOKIE,
  AuthBackendUnavailableError,
  type AuthUser,
  REFRESH_TOKEN_COOKIE,
  fetchAuthUser,
  authBackendFetch,
} from "@/lib/auth/server";
import { presetReportDates } from "@/lib/integrations/google-ads-report";
import {
  getWorkspaceInvitations,
  getWorkspaces,
} from "@/lib/workspaces/server";
import type {
  BillingPlan,
  BillingSummary,
  Workspace,
} from "@/lib/workspaces/types";

export type DashboardPageProps = {
  searchParams: Promise<{ workspaceId?: string | string[] }>;
};

export async function DashboardPage({
  searchParams,
  view,
}: {
  searchParams: Promise<{ workspaceId?: string | string[] }>;
  view: "overview" | "detail";
}) {
  const overview = view === "overview";
  const path = overview ? "/dashboard" : "/dashboard/google-ads";
  const query = await searchParams;
  const requestedId =
    typeof query.workspaceId === "string" &&
    /^[1-9]\d*$/.test(query.workspaceId)
      ? query.workspaceId
      : undefined;
  const returnTo = requestedId ? `${path}?workspaceId=${requestedId}` : path;
  const [user, invitations, workspaces] = await Promise.all([
    getCurrentUser(returnTo),
    getWorkspaceInvitations(returnTo),
    getWorkspaces(returnTo),
  ]);
  const workspace =
    workspaces.find((item) => item.id === requestedId) ?? workspaces[0];
  if (overview && workspace) {
    return (
      <GoogleAdsReportDashboard
        key={workspace.id}
        workspaces={workspaces}
        workspace={workspace}
        initialDates={presetReportDates(30, workspace.timezone)}
        view="overview"
        homeUser={user}
        invitationsCount={invitations.length}
        plan={await getHomePlan(workspace)}
      />
    );
  }
  const userLabel = user.displayName || user.email || "사용자";
  const settingsHref = workspace
    ? `/workspaces/${workspace.id}/settings`
    : "/workspaces";
  const advertisingHref = workspace
    ? `/workspaces/${workspace.id}/advertising`
    : "/workspaces";
  const homeHref = workspace
    ? `/dashboard?workspaceId=${workspace.id}`
    : "/dashboard";
  const performanceHref = workspace
    ? `/dashboard/google-ads?workspaceId=${workspace.id}`
    : "/dashboard/google-ads";
  const navigation = [
    {
      label: "홈",
      icon: Home,
      href: homeHref,
      current: overview,
    },
    {
      label: "성과 보기",
      icon: BarChart3,
      href: performanceHref,
      current: !overview,
    },
    {
      label: "Meta 성과",
      icon: BarChart3,
      href: workspace ? `/dashboard/meta?workspaceId=${workspace.id}` : "/dashboard/meta",
      current: false,
    },
    {
      label: "광고계정",
      icon: Megaphone,
      href: advertisingHref,
      current: false,
    },
    {
      label: "워크스페이스",
      icon: Building2,
      href: "/workspaces",
      current: false,
    },
    { label: "설정", icon: Settings2, href: settingsHref, current: false },
  ];

  return (
    <div
      className={`min-h-screen text-[#202b26] lg:flex ${
        overview ? "bg-[#faf9f7]" : "bg-[#f8faf8]"
      }`}
    >
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[#e8e4df] bg-[#fffefd] px-5 py-7 lg:flex ${
          overview ? "w-[248px]" : "w-[216px]"
        }`}
      >
        <Brand href={homeHref} />
        <nav aria-label="주요 메뉴" className="mt-10 space-y-1">
          {navigation.map(({ label, icon: Icon, href, current }) => (
            <Link
              key={label}
              href={href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#b84723] ${
                current
                  ? "bg-[#feeae2] text-[#a63c1b]"
                  : "text-[#5c6863] hover:bg-[#edf2ee]"
              }`}
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" />
              {label}
            </Link>
          ))}
          {user.isPlatformAdmin && (
            <Link
              href="/admin"
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-[#176a4b] hover:bg-[#e7f4ed]"
            >
              <ShieldCheck className="size-[18px]" aria-hidden="true" />
              운영 관리
            </Link>
          )}
        </nav>
        {overview && (
          <a
            href="mailto:okpc0305@gmail.com"
            className="mt-auto border-t border-[#e8e4df] py-5 text-sm text-[#657080] hover:text-[#b43c18]"
          >
            <CircleHelp
              className="mb-2 size-5 text-[#c04b24]"
              aria-hidden="true"
            />
            <span className="block font-semibold text-[#202b26]">
              도움이 필요하신가요?
            </span>
            <span className="mt-1 block text-xs">Growdo 고객문의</span>
          </a>
        )}
        <div
          className={`${
            overview ? "" : "mt-auto"
          } flex min-w-0 items-center gap-3 border-t border-[#dce2df] pt-5`}
        >
          {overview && (
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#18212f] font-bold text-[#fffaf4]"
            >
              {userLabel.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{userLabel}</p>
            <p className="mt-1 truncate text-xs text-[#5c6863]">
              {workspace?.name ?? "워크스페이스 없음"}
            </p>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div
        className={`min-w-0 flex-1 ${
          overview ? "lg:ml-[248px]" : "lg:ml-[216px]"
        }`}
      >
        <header className="border-b border-[#dce2df] bg-[#fdfefd] px-4 sm:px-7">
          <div className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-between gap-3">
            <div className="lg:hidden">
              <Brand href={homeHref} />
            </div>
            <p className="hidden min-w-0 truncate text-sm text-[#5c6863] lg:block">
              {workspace?.name ?? "워크스페이스"}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {user.isPlatformAdmin && (
                <Link
                  href="/admin"
                  aria-label="운영 관리"
                  title="운영 관리"
                  className="flex size-10 items-center justify-center rounded-md text-[#176a4b] hover:bg-[#e7f4ed] lg:hidden"
                >
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </Link>
              )}
              <Link
                href="/invitations"
                aria-label={`워크스페이스 초대${
                  invitations.length ? ` ${invitations.length}건` : ""
                }`}
                title="워크스페이스 초대"
                className="relative flex size-10 items-center justify-center rounded-md text-[#5c6863] hover:bg-[#edf2ee]"
              >
                <Bell aria-hidden="true" className="size-5" />
                {invitations.length > 0 && (
                  <span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-[#b84723] px-1 text-[10px] font-bold text-[#fdfefd]">
                    {invitations.length > 9 ? "9+" : invitations.length}
                  </span>
                )}
              </Link>
              <div className="lg:hidden">
                <LogoutButton />
              </div>
            </div>
          </div>
          <nav
            aria-label="모바일 주요 메뉴"
            className="mx-auto flex max-w-[1440px] gap-4 overflow-x-auto pb-3 text-xs font-semibold lg:hidden"
          >
            {navigation.map(({ label, href, current }) => (
              <Link
                key={label}
                href={href}
                aria-current={current ? "page" : undefined}
                className={`shrink-0 py-1 ${
                  current ? "text-[#a63c1b]" : "text-[#5c6863]"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main
          className={`mx-auto ${
            overview
              ? "max-w-[1180px] px-5 py-8 sm:px-8 sm:py-11 lg:px-12"
              : "max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8"
          }`}
        >
          <div
            className={`${
              overview ? "mb-8 gap-5" : "mb-6 gap-3"
            } flex flex-wrap items-end justify-between`}
          >
            {overview ? (
              <div>
                <p className="mb-3 text-xs font-bold text-[#176a4b]">
                  {workspace?.name ?? "내 워크스페이스"}
                </p>
                <h1 className="text-[30px] font-extrabold leading-tight sm:text-[38px]">
                  {user.displayName?.trim() || "사용자"}님,
                  <br />
                  오늘의 광고 현황이에요.
                </h1>
              </div>
            ) : (
              <h1 className="text-2xl font-bold">Google Ads 성과</h1>
            )}
            {workspace && (
              <Link
                href={advertisingHref}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold ${
                  overview
                    ? "bg-[#ed6a3b] text-white hover:bg-[#d8562c]"
                    : "border border-[#b8c4bd] bg-[#fdfefd] text-[#1d664b] hover:bg-[#edf2ee]"
                }`}
              >
                {overview ? (
                  <Plus className="size-4" aria-hidden="true" />
                ) : (
                  <Megaphone className="size-4" aria-hidden="true" />
                )}
                광고계정 관리
              </Link>
            )}
          </div>
          {workspace ? (
            <GoogleAdsReportDashboard
              key={workspace.id}
              workspaces={workspaces}
              workspace={workspace}
              initialDates={presetReportDates(30, workspace.timezone)}
              view={view}
            />
          ) : (
            <section className="border-y border-[#dce2df] py-12">
              <h2 className="text-lg font-bold">워크스페이스가 필요합니다</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-[#5c6863]">
                참여 중인 워크스페이스가 없습니다. 관리자에게 워크스페이스 생성
                또는 초대를 요청해 주세요.
              </p>
              <div className="mt-5 flex flex-wrap gap-5 text-sm font-semibold text-[#1d664b]">
                <Link
                  href="/workspaces"
                  className="underline underline-offset-4"
                >
                  워크스페이스 확인
                </Link>
                <Link
                  href="/invitations"
                  className="underline underline-offset-4"
                >
                  받은 초대 확인
                </Link>
              </div>
            </section>
          )}
        </main>
        <footer className="mx-auto max-w-[1440px] border-t border-[#dce2df] px-4 py-6 text-[#5c6863] sm:px-7">
          <PolicyLinks />
        </footer>
      </div>
    </div>
  );
}

function Brand({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="GrowdoAds 홈"
      className="inline-flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b84723]"
    >
      <span
        aria-hidden="true"
        className="relative flex size-7 items-center justify-center"
      >
        <span className="absolute size-6 rotate-45 rounded-[7px] bg-[#f26b3a]" />
        <span className="relative size-2 rounded-full bg-[#fff8f2]" />
      </span>
      <span className="text-lg font-black">
        Growdo<span className="text-[#c04b24]">Ads</span>
      </span>
    </Link>
  );
}

async function getCurrentUser(returnTo: string): Promise<AuthUser> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const refreshHref = `/api/auth/session?returnTo=${encodeURIComponent(
    returnTo
  )}`;
  if (!accessToken) redirect(refreshToken ? refreshHref : "/login");

  let response: Response;
  try {
    response = await fetchAuthUser(accessToken);
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError)
      redirect("/login?error=backend");
    throw error;
  }
  if (response.ok) return (await response.json()) as AuthUser;
  if (response.status === 401 && refreshToken) redirect(refreshHref);
  redirect(
    response.status === 401 ? "/login?error=session" : "/login?error=backend"
  );
}

async function getHomePlan(workspace: Workspace): Promise<BillingPlan | null> {
  if (workspace.role !== "owner" && workspace.role !== "admin") return null;
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return null;
  try {
    const response = await authBackendFetch(
      `/workspaces/${workspace.id}/billing/mock-payments/summary`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) return null;
    const summary = (await response.json()) as Partial<BillingSummary>;
    if (!Array.isArray(summary.plans) || !summary.currentPlanCode) return null;
    const plan = summary.plans.find(
      (item) => item.code === summary.currentPlanCode
    );
    return plan &&
      Number.isFinite(plan.priceAmount) &&
      plan.priceAmount >= 0 &&
      /^[A-Z]{3}$/.test(plan.currency) &&
      ["month", "year"].includes(plan.billingInterval)
      ? plan
      : null;
  } catch {
    return null;
  }
}
