import Link from "next/link";
import { ArrowLeft, BarChart3, LockKeyhole, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { GoogleAdsCampaignManager } from "@/components/campaigns/google-ads-campaign-manager";
import { canCreateCampaign } from "@/lib/integrations/google-ads-campaign";
import { getCurrentUser } from "@/lib/integrations/google-ads-campaign-server";
import { getWorkspaces } from "@/lib/workspaces/server";

export const metadata = { title: "광고 관리" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ accountId?: string | string[]; campaignId?: string | string[]; creationRequestId?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  if (!/^[1-9]\d*$(?![\s\S])/.test(workspaceId)) notFound();
  const query = await searchParams;
  const returnTo = `/workspaces/${workspaceId}/campaigns`;
  const [user, workspaces] = await Promise.all([getCurrentUser(returnTo), getWorkspaces(returnTo)]);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) notFound();
  const homeHref = `/dashboard?workspaceId=${workspaceId}`;
  const reportHref = `/dashboard/google-ads?workspaceId=${workspaceId}`;
  return <div className="min-h-screen bg-[#faf8f5] text-[#18212f] [&_*]:tracking-[0]">
    <header className="border-b border-[#e9e2da] bg-[#fdfbf8] px-5 sm:px-8">
      <div className="mx-auto flex min-h-[68px] max-w-4xl flex-wrap items-center justify-between gap-3 py-3 pr-12 sm:pr-0">
        <Link href={homeHref} aria-label="GrowdoAds 홈" className="text-xl font-black">Growdo<span className="text-[#c04b24]">Ads</span></Link>
        <nav aria-label="캠페인 메뉴" className="flex flex-wrap gap-3 text-sm font-semibold text-[#657080]">
          <Link href={reportHref} title="보고서" aria-label="보고서" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2"><BarChart3 className="size-5" aria-hidden="true" /><span className="hidden sm:inline">보고서</span></Link>
          <Link href={`${returnTo}/new`} title="캠페인 만들기" aria-label="캠페인 만들기" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2"><Plus className="size-5" aria-hidden="true" /><span className="hidden sm:inline">캠페인 만들기</span></Link>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-4xl px-5 py-7 sm:px-8 sm:py-10">
      <Link href={homeHref} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#657080]"><ArrowLeft className="size-4" aria-hidden="true" />홈으로</Link>
      <header className="border-b border-[#e9e2da] pb-6 pt-5"><p className="break-words text-sm font-semibold text-[#657080]">{workspace.name}</p><h1 className="mt-2 text-2xl font-extrabold">광고 관리</h1></header>
      {canCreateCampaign(workspace.role) ? <GoogleAdsCampaignManager workspace={workspace} userId={user.id} initialAccountId={typeof query.accountId === "string" ? query.accountId : ""} initialCampaignId={typeof query.campaignId === "string" ? query.campaignId : ""} initialCreationRequestId={typeof query.creationRequestId === "string" ? query.creationRequestId : ""} /> :
        <section className="py-8"><h2 className="flex items-center gap-2 text-base font-bold"><LockKeyhole className="size-5" aria-hidden="true" />광고 관리 권한이 없습니다</h2><p className="mt-3 text-sm text-[#657080]">광고 조회와 수정은 소유자, 관리자, 마케터만 가능합니다.</p><Link href={reportHref} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-[#b43c18]">보고서 확인</Link></section>}
    </main>
  </div>;
}
