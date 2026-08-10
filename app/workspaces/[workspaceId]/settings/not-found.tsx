import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf8f5] px-5 text-[#18212f]">
      <div className="max-w-md text-center">
        <SearchX
          aria-hidden="true"
          className="mx-auto size-10 text-[#c04b24]"
        />
        <h1 className="mt-6 text-2xl font-extrabold tracking-[-0.025em]">
          워크스페이스를 찾을 수 없습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#727873]">
          접근 권한이 없거나 더 이상 사용할 수 없는 워크스페이스입니다.
        </p>
        <Link
          href="/workspaces"
          className="mt-7 inline-flex h-10 items-center gap-2 rounded-lg bg-[#18212f] px-4 text-sm font-bold text-[#fff8f2] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> 내 워크스페이스
        </Link>
      </div>
    </main>
  );
}
