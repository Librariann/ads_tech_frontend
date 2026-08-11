import { ArrowLeft, Bell } from "lucide-react";
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { InvitationCenter } from "@/components/workspaces/invitation-center";
import { getWorkspaceInvitations } from "@/lib/workspaces/server";

export const metadata = {
  title: "초대 알림",
};

export default async function InvitationsPage() {
  const invitations = await getWorkspaceInvitations();

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#18212f]">
      <header className="border-b border-[#e9e2da] bg-[#fdfbf8] px-5 sm:px-8">
        <div className="mx-auto flex h-17 max-w-[900px] items-center justify-between">
          <Brand />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-5 py-10 sm:px-8 sm:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#747b75] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 대시보드
        </Link>

        <div className="dashboard-reveal mt-7 flex items-end justify-between gap-5 border-b border-[#ded7cf] pb-7">
          <div>
            <div className="flex items-center gap-2.5">
              <Bell aria-hidden="true" className="size-5 text-[#c04b24]" />
              <p className="text-sm font-extrabold text-[#c04b24]">알림</p>
            </div>
            <h1 className="mt-3 text-[2rem] font-extrabold leading-tight sm:text-[2.35rem]">
              워크스페이스 초대
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#707873]">
              초대받은 워크스페이스와 권한을 확인할 수 있습니다.
            </p>
          </div>
          {invitations.length ? (
            <span className="shrink-0 text-sm font-bold text-[#596372]">
              {invitations.length}건
            </span>
          ) : null}
        </div>

        <div className="dashboard-reveal dashboard-delay-1 mt-7">
          <InvitationCenter initialInvitations={invitations} />
        </div>
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
      <span className="text-[1.2rem] font-black">
        Growdo<span className="text-[#f26b3a]">Ads</span>
      </span>
    </Link>
  );
}
