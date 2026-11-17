import Link from "next/link";
import { notFound } from "next/navigation";
import { MetaReportDashboard } from "@/components/dashboard/meta-report";
import { isMetaId } from "@/lib/integrations/meta";
import { getWorkspaces } from "@/lib/workspaces/server";

export const metadata = { title: "Meta 광고 성과" };

export default async function MetaDashboardPage({ searchParams }: {
  searchParams: Promise<{ workspaceId?: string | string[] }>;
}) {
  const { workspaceId } = await searchParams;
  if (workspaceId !== undefined && !isMetaId(workspaceId)) notFound();
  const returnTo = `/dashboard/meta${workspaceId ? `?workspaceId=${workspaceId}` : ""}`;
  const workspaces = await getWorkspaces(returnTo);
  const workspace = workspaceId ? workspaces.find((w) => w.id === workspaceId) : workspaces[0];
  if (workspaceId && !workspace) notFound();
  return <main className="min-h-screen bg-[#f8faf8] px-4 py-6 text-[#202b26] sm:px-8">
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce3dd] pb-5">
        <Link href={workspace ? `/dashboard?workspaceId=${workspace.id}` : "/dashboard"} className="text-lg font-extrabold text-[#176a4b]">GrowdoAds</Link>
        <nav aria-label="광고 성과 메뉴" className="flex flex-wrap items-center gap-5 text-sm font-semibold">
          <Link href={workspace ? `/dashboard?workspaceId=${workspace.id}` : "/dashboard"}>홈</Link>
          <Link href={workspace ? `/dashboard/google-ads?workspaceId=${workspace.id}` : "/dashboard/google-ads"}>Google Ads 성과</Link>
          <Link href={returnTo} aria-current="page" className="text-[#176a4b]">Meta 성과</Link>
          <Link href={workspace ? `/workspaces/${workspace.id}/advertising?platform=meta` : "/workspaces"}>광고계정 관리</Link>
        </nav>
      </header>
      <h1 className="my-7 text-2xl font-bold">Meta 광고 성과 <span className="ml-2 text-sm font-normal text-[#657168]">읽기 전용</span></h1>
      {workspace ? <MetaReportDashboard key={workspace.id} workspace={workspace} workspaces={workspaces} /> :
        <section className="border-y border-[#dce3dd] py-8"><h2 className="font-bold">워크스페이스가 필요합니다</h2><Link href="/workspaces" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[#176a4b]">워크스페이스 확인</Link></section>}
    </div>
  </main>;
}
