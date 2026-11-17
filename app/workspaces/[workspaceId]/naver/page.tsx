import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { NaverManagement } from "@/components/campaigns/naver-management";
import { isNaverId } from "@/lib/integrations/naver";
import { getCurrentUser } from "@/lib/integrations/google-ads-campaign-server";
import { getWorkspaces } from "@/lib/workspaces/server";

export const metadata = { title: "네이버 일시중지 관리" };
export const dynamic = "force-dynamic";

export default async function NaverManagementPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (!isNaverId(workspaceId)) notFound();
  const returnTo = `/workspaces/${workspaceId}/naver`;
  const [user, workspaces] = await Promise.all([getCurrentUser(returnTo), getWorkspaces(returnTo)]);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) notFound();
  return <div className="min-h-screen bg-[#f8faf8] text-[#202c24] [&_*]:tracking-[0]">
    <header className="border-b border-[#dce3dd] bg-white px-5 sm:px-8"><div className="mx-auto flex min-h-[64px] max-w-5xl items-center py-3 pr-12 sm:pr-0">
      <Link href={`/dashboard?workspaceId=${workspaceId}`} aria-label="GrowdoAds 홈" className="text-xl font-black">Growdo<span className="text-[#c04b24]">Ads</span></Link>
    </div></header>
    <main className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
      <Link href={`/workspaces/${workspaceId}/advertising?platform=naver`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#176a4b]"><ArrowLeft className="size-4" aria-hidden="true" />네이버 광고계정으로</Link>
      <div className="border-b border-[#dce3dd] py-4"><p className="break-words text-sm text-[#657168]">{workspace.name}</p><h1 className="mt-2 text-2xl font-bold">네이버 일시중지 관리</h1></div>
      <NaverManagement key={`${user.id}:${workspaceId}`} workspaceId={workspaceId} userId={user.id} role={workspace.role} />
    </main>
  </div>;
}
