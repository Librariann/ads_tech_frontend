import { cookies } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3, ShieldCheck, Zap } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/server";

const errorMessages: Record<string, string> = {
  backend: "인증 서버에 연결할 수 없습니다. 서버 상태를 확인해 주세요.",
  oauth: "소셜 로그인을 완료하지 못했습니다. 다시 시도해 주세요.",
  provider: "지원하지 않는 로그인 방식입니다.",
  session: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.",
};

export const metadata: Metadata = {
  title: "로그인",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  if (
    !error &&
    (cookieStore.has(ACCESS_TOKEN_COOKIE) ||
      cookieStore.has(REFRESH_TOKEN_COOKIE))
  ) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(320px,0.78fr)_1.22fr]">
      <aside className="relative overflow-hidden bg-slate-900 px-6 py-6 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <div className="relative z-10">
          <p className="text-2xl font-bold">
            Growdo<span className="text-indigo-400">Ads</span>
          </p>
        </div>

        <div className="relative z-10 hidden max-w-md lg:block">
          <div className="mb-8 flex size-12 items-center justify-center rounded-lg bg-indigo-500">
            <BarChart3 aria-hidden="true" className="size-6" />
          </div>
          <h2 className="text-3xl font-bold leading-tight">
            광고 운영의 모든 흐름을
            <br />
            한곳에서 관리하세요.
          </h2>
          <div className="mt-10 space-y-4 text-sm text-slate-300">
            <p className="flex items-center gap-3">
              <Zap aria-hidden="true" className="size-4 text-amber-400" />
              실시간 캠페인 성과 확인
            </p>
            <p className="flex items-center gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-emerald-400"
              />
              안전한 계정 및 세션 관리
            </p>
          </div>
        </div>

        <p className="relative z-10 hidden text-xs text-slate-500 lg:block">
          GrowdoAds Workspace
        </p>

        <div
          aria-hidden="true"
          className="absolute -bottom-40 -right-24 size-80 rotate-12 border border-indigo-400/20"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-20 right-16 size-52 rotate-12 border border-slate-600/40"
        />
      </aside>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:px-16">
        <LoginForm initialError={error ? errorMessages[error] : undefined} />
      </section>
    </main>
  );
}
