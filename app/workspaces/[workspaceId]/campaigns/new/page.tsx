import { ArrowLeft, BarChart3, LockKeyhole, Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoogleAdsCampaignForm } from "@/components/campaigns/google-ads-campaign-form";
import { canCreateCampaign } from "@/lib/integrations/google-ads-campaign";
import { getCurrentUser } from "@/lib/integrations/google-ads-campaign-server";
import { getWorkspaces } from "@/lib/workspaces/server";

export const metadata = { title: "캠페인 만들기" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ params }: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!/^[1-9]\d*$/.test(workspaceId)) notFound();
  const returnTo = `/workspaces/${workspaceId}/campaigns/new`;
  const [user, workspaces] = await Promise.all([getCurrentUser(returnTo), getWorkspaces(returnTo)]);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) notFound();
  const homeHref = `/dashboard?workspaceId=${workspaceId}`;
  const reportHref = `/dashboard/google-ads?workspaceId=${workspaceId}`;

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#18212f] [&_*]:tracking-[0]">
      <header className="border-b border-[#e9e2da] bg-[#fdfbf8] px-5 sm:px-8">
        <div className="mx-auto flex min-h-[68px] max-w-4xl flex-wrap items-center justify-between gap-3 py-3 pr-12 sm:pr-0">
          <Link href={homeHref} aria-label="GrowdoAds 홈" className="text-xl font-black focus-visible:outline-2 focus-visible:outline-[#f26b3a]">
            Growdo<span className="text-[#c04b24]">Ads</span>
          </Link>
          <nav aria-label="캠페인 메뉴" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#657080] sm:gap-4">
            <Link href={`/workspaces/${workspaceId}/campaigns`} title="광고 관리" aria-label="광고 관리" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md hover:text-[#b43c18] focus-visible:outline-2 focus-visible:outline-[#c04b24]">
              <Megaphone className="size-5 sm:size-4" aria-hidden="true" /><span className="hidden sm:inline">광고 관리</span>
            </Link>
            <Link href={reportHref} title="보고서" aria-label="보고서" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md hover:text-[#b43c18] focus-visible:outline-2 focus-visible:outline-[#c04b24]">
              <BarChart3 className="size-5 sm:size-4" aria-hidden="true" /><span className="hidden sm:inline">보고서</span>
            </Link>
            <Link href={`/workspaces/${workspaceId}/advertising`} title="광고계정 연결" aria-label="광고계정 연결" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md hover:text-[#b43c18] focus-visible:outline-2 focus-visible:outline-[#c04b24]">
              <Plus className="size-5 sm:size-4" aria-hidden="true" /><span className="hidden sm:inline">광고계정 연결</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-7 sm:px-8 sm:py-10">
        <Link href={homeHref} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#657080] hover:text-[#b43c18]">
          <ArrowLeft className="size-4" aria-hidden="true" />홈으로
        </Link>
        <header className="border-b border-[#e9e2da] pb-6 pt-5">
          <p className="break-words text-sm font-semibold text-[#657080]">{workspace.name}</p>
          <h1 className="mt-2 text-2xl font-extrabold">캠페인 만들기</h1>
          <p className="mt-3 text-sm font-semibold text-[#176a4b]">검색 · 일시중지</p>
        </header>
        {canCreateCampaign(workspace.role) ? (
          <GoogleAdsCampaignForm key={`${user.id}:${workspace.id}`} workspace={workspace} userId={user.id} />
        ) : (
          <section className="border-b border-[#e9e2da] py-8" aria-labelledby="campaign-access-title">
            <h2 id="campaign-access-title" className="flex items-center gap-2 text-base font-bold">
              <LockKeyhole className="size-5" aria-hidden="true" />생성 권한이 없습니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#657080]">캠페인 생성과 요청 조회는 소유자, 관리자, 마케터만 가능합니다.</p>
            <Link href={reportHref} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#b43c18]">
              <BarChart3 className="size-4" aria-hidden="true" />보고서 확인
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
