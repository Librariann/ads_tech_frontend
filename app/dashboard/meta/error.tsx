"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

export default function Error({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-[#f8faf8] p-8 text-[#202b26]">
    <h1 className="text-xl font-bold">워크스페이스를 확인하지 못했습니다</h1>
    <p role="alert" className="mt-3 text-sm">잠시 후 다시 시도하거나 워크스페이스 접근 권한을 확인해 주세요.</p>
    <div className="mt-5 flex flex-wrap gap-5 text-sm font-semibold text-[#176a4b]">
      <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2"><RefreshCw className="size-4" aria-hidden="true" />다시 시도</button>
      <Link href="/workspaces" className="inline-flex min-h-11 items-center">워크스페이스 확인</Link>
    </div>
  </main>;
}
