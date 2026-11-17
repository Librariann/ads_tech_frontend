"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function CampaignPageError({ reset }: { reset: () => void }) {
  return <main className="min-h-screen bg-[#faf8f5] px-5 py-10 text-[#18212f]">
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold">캠페인 생성 화면을 불러오지 못했습니다</h1>
      <div className="mt-5 flex flex-wrap items-center gap-5">
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#e9e2da] px-4 text-sm font-bold">
          <RefreshCw className="size-4" aria-hidden="true" />다시 불러오기
        </button>
        <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#b43c18]">
          <ArrowLeft className="size-4" aria-hidden="true" />홈으로
        </Link>
      </div>
    </div>
  </main>;
}
