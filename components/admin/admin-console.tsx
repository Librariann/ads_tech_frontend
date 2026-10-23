"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import type {
  AdminPlan,
  AdminUser,
  AdminUsersPage,
  AdminWorkspace,
} from "@/lib/admin/types";
import type { AuthUser } from "@/lib/auth/server";

type Props = {
  me: AuthUser;
  users: AdminUsersPage;
  plans: AdminPlan[];
  query: string;
};

export function AdminConsole({ me, users, plans, query }: Props) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [mode, setMode] = useState<"grant" | "revoke">("grant");
  const [planCode, setPlanCode] = useState("pro");
  const [endsAt, setEndsAt] = useState(defaultEndDate());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);

  const selectedUser =
    users.items.find((user) => user.id === selectedUserId) ?? users.items[0];
  const selectedWorkspace =
    selectedUser?.workspaces.find(
      (workspace) => workspace.id === selectedWorkspaceId,
    ) ?? selectedUser?.workspaces[0];
  const pages = Math.max(1, Math.ceil(users.total / users.limit));
  const canGrant =
    !!selectedWorkspace &&
    (!selectedWorkspace.subscription ||
      selectedWorkspace.subscription.provider === "manual") &&
    selectedWorkspace.status === "active";
  const canRevoke =
    selectedWorkspace?.subscription?.provider === "manual" &&
    selectedWorkspace.subscription.planCode !== "starter" &&
    selectedWorkspace.subscription.status === "active";

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setSelectedWorkspaceId(user.workspaces[0]?.id ?? null);
    setNotice(null);
    retry.current = null;
  }

  async function submit() {
    if (!selectedWorkspace || busy) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      setNotice({ ok: false, text: "사유를 10자 이상 입력해 주세요." });
      return;
    }
    if (mode === "grant" && (!canGrant || !endsAt)) return;
    if (mode === "revoke" && !canRevoke) return;

    const payload =
      mode === "grant"
        ? {
            planCode,
            endsAt: new Date(`${endsAt}T23:59:59+09:00`).toISOString(),
            reason: trimmedReason,
          }
        : { reason: trimmedReason };
    const fingerprint = JSON.stringify({
      workspaceId: selectedWorkspace.id,
      mode,
      payload,
    });
    if (retry.current?.fingerprint !== fingerprint) {
      retry.current = { fingerprint, requestId: crypto.randomUUID() };
    }
    setBusy(true);
    setNotice(null);
    try {
      const endpoint = `/api/admin/workspaces/${selectedWorkspace.id}/manual-subscription${
        mode === "revoke" ? "/revoke" : ""
      }`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          requestId: retry.current.requestId,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      if (response.status === 401) {
        window.location.href = "/api/auth/session?returnTo=/admin";
        return;
      }
      if (!response.ok) {
        const message = Array.isArray(result?.message)
          ? result.message[0]
          : result?.message;
        throw new Error(message || "처리하지 못했습니다.");
      }
      retry.current = null;
      setReason("");
      setNotice({
        ok: true,
        text:
          mode === "grant"
            ? "수동 구독을 부여했습니다."
            : "수동 구독을 철회했습니다.",
      });
      router.refresh();
    } catch (error) {
      setNotice({
        ok: false,
        text:
          error instanceof Error
            ? error.message
            : "요청을 처리하지 못했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8f7] text-[#18232a]">
      <header className="border-b border-[#dfe4e0] bg-white">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-bold hover:text-[#b43c18]"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> 대시보드
            </Link>
            <span className="hidden h-5 w-px bg-[#dfe4e0] sm:block" />
            <span className="inline-flex items-center gap-2 text-sm font-extrabold">
              <ShieldCheck
                className="size-4 text-[#176a4b]"
                aria-hidden="true"
              />{" "}
              운영 관리
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#5b6864]">
            <span className="hidden max-w-56 truncate sm:inline">
              {me.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1360px] px-4 py-7 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#dfe4e0] pb-6">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">
              사용자 및 구독
            </h1>
            <p className="mt-1 text-sm text-[#65716c]">
              전체 사용자 {users.total.toLocaleString()}명
            </p>
          </div>
          <form action="/admin" className="flex w-full gap-2 sm:w-[360px]">
            <label className="sr-only" htmlFor="admin-query">
              사용자 검색
            </label>
            <input
              id="admin-query"
              name="query"
              defaultValue={query}
              placeholder="이메일 또는 이름 검색"
              className="h-10 min-w-0 flex-1 rounded-md border border-[#cbd4ce] bg-white px-3 text-sm outline-none focus:border-[#176a4b]"
            />
            <button
              type="submit"
              title="검색"
              aria-label="검색"
              className="flex size-10 items-center justify-center rounded-md bg-[#1c3831] text-white hover:bg-[#285146]"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>

        <div className="grid gap-8 pt-5 lg:grid-cols-[minmax(0,1fr)_350px]">
          <section aria-label="사용자 목록" className="min-w-0">
            <div className="overflow-x-auto border-y border-[#dfe4e0] bg-white">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-[#f0f4f1] text-xs font-bold text-[#52605a]">
                  <tr>
                    <th className="px-4 py-3">사용자</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">워크스페이스</th>
                    <th className="px-4 py-3">가입일</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-t border-[#e8ece9] ${selectedUser?.id === user.id ? "bg-[#edf7f0]" : "hover:bg-[#fafcfb]"}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => selectUser(user)}
                          className="block max-w-60 text-left focus-visible:outline-2 focus-visible:outline-[#176a4b]"
                        >
                          <span className="block truncate font-bold">
                            {user.displayName || user.email}
                          </span>
                          <span className="block truncate text-xs text-[#75817a]">
                            {user.email}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={user.status} />
                        {user.isPlatformAdmin ? (
                          <span className="ml-2 text-xs font-semibold text-[#176a4b]">
                            운영자
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{user.workspaces.length}개</td>
                      <td className="px-4 py-3 text-[#61706a]">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="pr-3">
                        <button
                          type="button"
                          onClick={() => selectUser(user)}
                          aria-label={`${user.email} 상세 보기`}
                          title="상세 보기"
                          className="flex size-8 items-center justify-center rounded-md hover:bg-[#e5eee8]"
                        >
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!users.items.length ? (
                <div className="px-4 py-14 text-center text-sm text-[#69756e]">
                  검색 결과가 없습니다.
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-[#61706a]">
              <span>
                {users.page} / {pages} 페이지
              </span>
              <div className="flex gap-2">
                <Pager
                  href={pageHref(query, users.page - 1)}
                  disabled={users.page <= 1}
                  label="이전 페이지"
                  icon={ChevronLeft}
                />
                <Pager
                  href={pageHref(query, users.page + 1)}
                  disabled={users.page >= pages}
                  label="다음 페이지"
                  icon={ChevronRight}
                />
              </div>
            </div>
          </section>

          <aside className="border-t border-[#dfe4e0] pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            {selectedUser ? (
              <>
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#e3efe6] text-[#176a4b]">
                    <Users className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-extrabold">
                      {selectedUser.displayName || selectedUser.email}
                    </h2>
                    <p className="break-all text-xs text-[#65716c]">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-2 border-y border-[#dfe4e0] py-4">
                  {selectedUser.workspaces.length ? (
                    selectedUser.workspaces.map((workspace) => (
                      <button
                        key={workspace.id}
                        type="button"
                        onClick={() => {
                          setSelectedWorkspaceId(workspace.id);
                          setNotice(null);
                          retry.current = null;
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm ${workspace.id === selectedWorkspace?.id ? "bg-[#e3efe6] text-[#174c37]" : "hover:bg-[#eef2ef]"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-bold">
                            {workspace.name}
                          </span>
                          <span className="block text-xs opacity-70">
                            {workspace.role} · {workspace.status}
                          </span>
                        </span>
                        <ArrowRight
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-[#65716c]">
                      소속 워크스페이스가 없습니다.
                    </p>
                  )}
                </div>
                {selectedWorkspace ? (
                  <div className="pt-5">
                    <SubscriptionDetail workspace={selectedWorkspace} />
                    <div className="mt-6 border-t border-[#dfe4e0] pt-5">
                      <h3 className="text-sm font-extrabold">수동 구독 관리</h3>
                      <div className="mt-3 inline-flex rounded-md border border-[#cbd4ce] bg-white p-0.5 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setMode("grant");
                            setNotice(null);
                          }}
                          className={`rounded px-3 py-1.5 ${mode === "grant" ? "bg-[#1c3831] text-white" : "text-[#65716c]"}`}
                        >
                          부여
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMode("revoke");
                            setNotice(null);
                          }}
                          className={`rounded px-3 py-1.5 ${mode === "revoke" ? "bg-[#1c3831] text-white" : "text-[#65716c]"}`}
                        >
                          철회
                        </button>
                      </div>
                      {mode === "grant" ? (
                        <div className="mt-4 space-y-3">
                          <label
                            className="block text-xs font-bold"
                            htmlFor="admin-plan"
                          >
                            플랜
                          </label>
                          <select
                            id="admin-plan"
                            value={planCode}
                            onChange={(event) =>
                              setPlanCode(event.target.value)
                            }
                            className="h-10 w-full rounded-md border border-[#cbd4ce] bg-white px-3 text-sm"
                          >
                            {plans.map((plan) => (
                              <option key={plan.code} value={plan.code}>
                                {plan.name}
                              </option>
                            ))}
                          </select>
                          <label
                            className="block text-xs font-bold"
                            htmlFor="admin-ends"
                          >
                            종료일
                          </label>
                          <input
                            id="admin-ends"
                            type="date"
                            value={endsAt}
                            onChange={(event) => setEndsAt(event.target.value)}
                            min={today()}
                            className="h-10 w-full rounded-md border border-[#cbd4ce] bg-white px-3 text-sm"
                          />
                        </div>
                      ) : null}
                      <label
                        className="mt-4 block text-xs font-bold"
                        htmlFor="admin-reason"
                      >
                        처리 사유
                      </label>
                      <textarea
                        id="admin-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="예: 서비스 장애 보상으로 30일 제공"
                        className="mt-2 w-full resize-y rounded-md border border-[#cbd4ce] bg-white px-3 py-2 text-sm outline-none focus:border-[#176a4b]"
                      />
                      {mode === "grant" && !canGrant ? (
                        <p className="mt-2 text-xs text-[#a13d21]">
                          활성 유료 구독 또는 비활성 워크스페이스에는 부여할 수
                          없습니다.
                        </p>
                      ) : null}
                      {mode === "revoke" && !canRevoke ? (
                        <p className="mt-2 text-xs text-[#65716c]">
                          철회 가능한 수동 유료 구독이 없습니다.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={submit}
                        disabled={
                          busy || (mode === "grant" ? !canGrant : !canRevoke)
                        }
                        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1c3831] px-4 text-sm font-bold text-white hover:bg-[#285146] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : mode === "grant" ? (
                          <Check className="size-4" aria-hidden="true" />
                        ) : (
                          <CreditCard className="size-4" aria-hidden="true" />
                        )}
                        {busy
                          ? "처리 중"
                          : mode === "grant"
                            ? "수동 구독 부여"
                            : "수동 구독 철회"}
                      </button>
                      {notice ? (
                        <p
                          role="status"
                          className={`mt-3 text-xs font-semibold ${notice.ok ? "text-[#176a4b]" : "text-[#a13d21]"}`}
                        >
                          {notice.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center border-y border-[#dfe4e0] text-center text-[#718078]">
                <Users className="size-6" aria-hidden="true" />
                <p className="mt-3 text-sm">사용자를 선택하세요.</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function SubscriptionDetail({ workspace }: { workspace: AdminWorkspace }) {
  const subscription = workspace.subscription;
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-extrabold">
        <CreditCard className="size-4 text-[#176a4b]" aria-hidden="true" /> 구독
        상태
      </div>
      {subscription ? (
        <dl className="mt-3 grid grid-cols-[90px_1fr] gap-y-2 text-sm">
          <dt className="text-[#718078]">플랜</dt>
          <dd className="font-bold">{subscription.planName}</dd>
          <dt className="text-[#718078]">상태</dt>
          <dd>
            <StatusLabel status={subscription.status} />
          </dd>
          <dt className="text-[#718078]">제공 방식</dt>
          <dd>
            {subscription.provider === "manual"
              ? "수동"
              : subscription.provider}
          </dd>
          <dt className="text-[#718078]">종료일</dt>
          <dd className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {formatDate(subscription.currentPeriodEnd)}
          </dd>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-[#718078]">등록된 구독이 없습니다.</p>
      )}
    </div>
  );
}

function StatusLabel({ status }: { status: string }) {
  const styles =
    status === "active"
      ? "bg-[#e2f3e9] text-[#176a4b]"
      : status === "suspended" || status === "past_due"
        ? "bg-[#fff2dd] text-[#8e5a11]"
        : "bg-[#eef0ee] text-[#5d6a62]";
  const labels: Record<string, string> = {
    active: "활성",
    suspended: "정지",
    deleted: "삭제",
    trialing: "체험",
    past_due: "결제 지연",
    canceled: "취소",
    expired: "만료",
  };
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${styles}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function Pager({
  href,
  disabled,
  label,
  icon: Icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: typeof ChevronLeft;
}) {
  return disabled ? (
    <span
      className="flex size-8 items-center justify-center rounded border border-[#dfe4e0] text-[#adb9b0]"
      aria-label={label}
    >
      <Icon className="size-4" />
    </span>
  ) : (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded border border-[#cbd4ce] hover:bg-white"
    >
      <Icon className="size-4" />
    </Link>
  );
}

function pageHref(query: string, page: number) {
  return `/admin?${new URLSearchParams({ query, page: String(page) })}`;
}

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function defaultEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
