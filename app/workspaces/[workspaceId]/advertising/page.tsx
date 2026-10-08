import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleAdsSection } from "@/components/integrations/google-ads-section";
import { getWorkspace } from "@/lib/workspaces/server";

export const metadata = { title: "광고계정 등록" };

export default async function AdvertisingSetupPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!/^[1-9]\d*$/.test(workspaceId)) notFound();
  const workspace = await getWorkspace(
    workspaceId,
    `/workspaces/${workspaceId}/advertising`,
  );
  const canManage = workspace.role === "owner" || workspace.role === "admin";
  return (
    <main className="min-h-screen bg-[#fafbf9] px-5 py-7 text-[#18212f] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce3dd] pb-5">
          <Link href="/" className="text-lg font-extrabold text-[#176a4b]">
            GrowdoAds
          </Link>
          <Link
            href={`/workspaces/${workspaceId}/settings`}
            className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#657168] hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            워크스페이스 설정
          </Link>
        </div>
        <header className="py-8 sm:py-10">
          <p className="break-words text-sm font-semibold text-[#657168]">
            {workspace.name}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold">광고계정 등록</h1>
        </header>
        <nav
          aria-label="광고 매체"
          className="mb-7 flex flex-wrap items-center gap-5 border-b border-[#dce3dd] text-sm"
        >
          <a
            href="#google-ads"
            aria-current="page"
            className="border-b-2 border-[#176a4b] py-3 font-bold text-[#176a4b]"
          >
            Google Ads
          </a>
          <span aria-disabled="true" className="py-3 text-[#7a847c]">
            Meta <span className="ml-1 text-xs">준비 중</span>
          </span>
          <span aria-disabled="true" className="py-3 text-[#7a847c]">
            네이버 <span className="ml-1 text-xs">준비 중</span>
          </span>
        </nav>
        {canManage ? (
          <GoogleAdsSection
            workspaceId={workspaceId}
            workspaceName={workspace.name}
          />
        ) : (
          <div className="border-y border-[#dce3dd] py-7">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <LockKeyhole className="size-5" aria-hidden="true" />
              관리 권한이 필요합니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#657168]">
              광고계정 등록은 워크스페이스 소유자 또는 관리자에게 요청해 주세요.
            </p>
            <Link
              href={`/workspaces/${workspaceId}/settings`}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#176a4b]"
            >
              워크스페이스 확인
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
