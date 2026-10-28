import { ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaces } from "@/lib/workspaces/server";

export const metadata = { title: "광고 시작하기" };

export default async function AdvertisingEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ googleAds?: string }>;
}) {
  const callbackFailed = (await searchParams).googleAds === "connection_failed";
  const workspaces = (await getWorkspaces("/advertising")).filter(
    (workspace) => workspace.role === "owner" || workspace.role === "admin",
  );
  if (workspaces.length === 1)
    redirect(
      `/workspaces/${workspaces[0].id}/advertising${
        callbackFailed ? "?googleAds=connection_failed" : ""
      }`,
    );
  return (
    <main className="min-h-screen bg-[#fafbf9] px-5 py-10 text-[#18212f] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#657168]"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />홈
        </Link>
        <h1 className="mt-7 text-2xl font-extrabold">
          광고를 운영할 워크스페이스
        </h1>
        {callbackFailed && (
          <p role="alert" className="mt-5 text-sm leading-6 text-[#a23628]">
            Google 인증을 완료하지 못했습니다. 워크스페이스를 선택한 뒤 다시
            확인해 주세요.
          </p>
        )}
        {workspaces.length ? (
          <ul className="mt-7 divide-y divide-[#dce3dd] border-y border-[#dce3dd]">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/workspaces/${workspace.id}/advertising${
                    callbackFailed ? "?googleAds=connection_failed" : ""
                  }`}
                  className="flex min-h-20 items-center gap-3 py-4 hover:bg-[#edf2ee]"
                >
                  <Building2
                    className="size-5 shrink-0 text-[#176a4b]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold">
                    {workspace.name}
                  </span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-7 border-y border-[#dce3dd] py-6">
            <p className="text-sm leading-6 text-[#657168]">
              관리 가능한 워크스페이스가 없습니다. 워크스페이스를 만들거나
              관리자 권한을 요청해 주세요.
            </p>
            <Link
              href="/workspaces"
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
