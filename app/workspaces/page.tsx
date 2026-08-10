import { ArrowRight, Building2, Home, Settings2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { getWorkspaces } from "@/lib/workspaces/server";

export const metadata = {
  title: "워크스페이스 선택",
};

export default async function WorkspacesPage() {
  const workspaces = await getWorkspaces();

  if (workspaces.length === 1) {
    redirect(`/workspaces/${workspaces[0].id}/settings`);
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#18212f]">
      <header className="border-b border-[#e9e2da] bg-[#fdfbf8] px-5 sm:px-8">
        <div className="mx-auto flex h-17 max-w-[1040px] items-center justify-between">
          <Brand />
          <div className="flex items-center gap-1">
            <Link
              href="/"
              aria-label="홈으로 이동"
              title="홈"
              className="flex size-10 items-center justify-center rounded-lg text-[#657080] hover:bg-[#f3eee8] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-[#f26b3a]"
            >
              <Home aria-hidden="true" className="size-5" />
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[780px] px-5 py-12 sm:px-8 sm:py-18">
        <div className="dashboard-reveal">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#feeae2] text-[#b43c18]">
            <Building2 aria-hidden="true" className="size-5" />
          </div>
          <h1 className="mt-5 text-[2rem] font-extrabold tracking-[-0.035em]">
            워크스페이스를 선택하세요
          </h1>
          <p className="mt-3 text-[0.95rem] leading-7 text-[#6d746f]">
            설정을 확인하거나 변경할 워크스페이스로 이동합니다.
          </p>
        </div>

        {workspaces.length ? (
          <div className="dashboard-reveal dashboard-delay-1 mt-9 overflow-hidden rounded-xl border border-[#e4ddd5] bg-[#fffdf9]">
            {workspaces.map((workspace, index) => (
              <Link
                key={workspace.id}
                href={`/workspaces/${workspace.id}/settings`}
                className={`group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-[#f8f3ed] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#f26b3a] sm:px-6 ${
                  index ? "border-t border-[#ece5dd]" : ""
                }`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#18212f] text-[#fff8f2]">
                  <Settings2 aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {workspace.name}
                  </span>
                  <span className="mt-1 block text-xs text-[#857e77]">
                    {getRoleLabel(workspace.role)} · {workspace.timezone}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-5 text-[#9a928a] transition-transform group-hover:translate-x-0.5 group-hover:text-[#b43c18]"
                />
              </Link>
            ))}
          </div>
        ) : (
          <section className="dashboard-reveal dashboard-delay-1 mt-10 border-y border-[#e4ddd5] py-9">
            <h2 className="text-lg font-bold">
              연결된 워크스페이스가 없습니다
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#74716c]">
              기존 계정에는 개인 워크스페이스가 없을 수 있습니다. 새 계정으로
              가입하거나 관리자에게 워크스페이스 생성을 요청해 주세요.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-[#18212f] px-4 text-sm font-bold text-[#fff8f2] hover:bg-[#2a3545] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a]"
            >
              <Home aria-hidden="true" className="size-4" /> 홈으로 돌아가기
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link
      href="/"
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
    </Link>
  );
}

function getRoleLabel(role: string) {
  return {
    owner: "소유자",
    admin: "관리자",
    marketer: "마케터",
    viewer: "조회자",
  }[role];
}
