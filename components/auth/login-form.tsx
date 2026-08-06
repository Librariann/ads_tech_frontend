"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
} from "lucide-react";

type LoginFormProps = {
  initialError?: string;
};

const providers = [
  {
    id: "naver",
    label: "네이버로 계속하기",
    icon: (
      <span
        aria-hidden="true"
        className="flex size-5 items-center justify-center bg-[#03c75a] text-xs font-black text-white"
      >
        N
      </span>
    ),
  },
  {
    id: "kakao",
    label: "카카오로 계속하기",
    icon: (
      <MessageCircle
        aria-hidden="true"
        className="size-5 fill-[#3c1e1e] text-[#3c1e1e]"
      />
    ),
  },
  {
    id: "google",
    label: "Google로 계속하기",
    icon: (
      <span aria-hidden="true" className="text-lg font-bold text-[#4285f4]">
        G
      </span>
    ),
  },
] as const;

export function LoginForm({ initialError }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(payload.message || "로그인 요청을 처리하지 못했습니다.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-9">
        <p className="mb-3 text-sm font-semibold text-indigo-600">
          WELCOME BACK
        </p>
        <h1 className="text-3xl font-bold text-slate-900">로그인</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          광고 운영 계정으로 워크스페이스에 접속하세요.
        </p>
      </div>

      <div className="grid gap-3">
        {providers.map((provider) => (
          <a
            key={provider.id}
            href={`/api/auth/oauth/${provider.id}`}
            className={`flex h-11 items-center justify-center gap-3 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
              provider.id === "naver"
                ? "border-[#03c75a] bg-[#03c75a] text-white hover:bg-[#02b351]"
                : provider.id === "kakao"
                  ? "border-[#181712] bg-[#fee500] text-[#3c1e1e] hover:bg-[#f5dc00]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {provider.icon}
            <span>{provider.label}</span>
          </a>
        ))}
      </div>

      <div className="my-7 flex items-center gap-4" aria-hidden="true">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium text-slate-400">또는 이메일</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            이메일
          </label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="name@company.com"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            비밀번호
          </label>
          <div className="relative">
            <LockKeyhole
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="비밀번호 입력"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/15"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              title={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-500"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <ArrowRight aria-hidden="true" className="size-4" />
          )}
          {isSubmitting ? "로그인 중" : "이메일로 로그인"}
        </button>
      </form>
    </div>
  );
}
