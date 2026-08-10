"use client";

import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Home,
  LoaderCircle,
  LockKeyhole,
  Save,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import type {
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from "@/lib/workspaces/types";

type WorkspaceSettingsProps = {
  workspace: Workspace;
  members: WorkspaceMember[] | null;
};

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "소유자",
  admin: "관리자",
  marketer: "마케터",
  viewer: "조회자",
};

const memberStatusLabels: Record<WorkspaceMemberStatus, string> = {
  active: "활성",
  invited: "초대 중",
  disabled: "비활성",
};

const currencies = [
  { value: "KRW", label: "대한민국 원 (KRW)" },
  { value: "USD", label: "미국 달러 (USD)" },
  { value: "JPY", label: "일본 엔 (JPY)" },
] as const;

const timezones = [
  { value: "Asia/Seoul", label: "서울 (UTC+9)" },
  { value: "Asia/Tokyo", label: "도쿄 (UTC+9)" },
  { value: "America/Los_Angeles", label: "로스앤젤레스" },
  { value: "UTC", label: "협정 세계시 (UTC)" },
] as const;

export function WorkspaceSettings({
  workspace: initialWorkspace,
  members,
}: WorkspaceSettingsProps) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [form, setForm] = useState<UpdateWorkspaceInput>({
    name: initialWorkspace.name,
    defaultCurrency: initialWorkspace.defaultCurrency,
    timezone: initialWorkspace.timezone,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  }>();
  const canEdit = workspace.role === "owner" || workspace.role === "admin";
  const isDirty =
    form.name !== workspace.name ||
    form.defaultCurrency !== workspace.defaultCurrency ||
    form.timezone !== workspace.timezone;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !isDirty) return;

    setIsSaving(true);
    setMessage(undefined);

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name?.trim(),
          defaultCurrency: form.defaultCurrency,
          timezone: form.timezone,
        }),
      });
      const payload = (await response.json()) as Workspace & {
        message?: string | string[];
      };

      if (response.status === 401) {
        window.location.href = `/api/auth/session?returnTo=${encodeURIComponent(
          window.location.pathname,
        )}`;
        return;
      }
      if (!response.ok) {
        const errorMessage = Array.isArray(payload.message)
          ? payload.message[0]
          : payload.message;
        setMessage({
          type: "error",
          text: errorMessage || "설정을 저장하지 못했습니다.",
        });
        return;
      }

      setWorkspace(payload);
      setForm({
        name: payload.name,
        defaultCurrency: payload.defaultCurrency,
        timezone: payload.timezone,
      });
      setMessage({ type: "success", text: "변경사항을 저장했습니다." });
      router.refresh();
    } catch {
      setMessage({
        type: "error",
        text: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#18212f] lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[#e9e2da] bg-[#fdfbf8] px-5 py-7 lg:flex">
        <Brand />

        <nav aria-label="주요 메뉴" className="mt-12 space-y-1.5">
          <SidebarLink href="/" icon={Home} label="홈" />
          <SidebarLink
            href={`/workspaces/${workspace.id}/settings`}
            icon={Settings2}
            label="워크스페이스 설정"
            current
          />
        </nav>

        <div className="mt-auto border-t border-[#e9e2da] pt-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#18212f] text-[#fff8f2]">
              <Building2 aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{workspace.name}</p>
              <p className="mt-0.5 text-xs text-[#8a8179]">
                {roleLabels[workspace.role]}
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-23 lg:ml-[248px] lg:pb-0">
        <header className="border-b border-[#e9e2da] bg-[#fdfbf8] px-5 sm:px-8 lg:hidden">
          <div className="flex h-17 items-center justify-between">
            <Brand />
            <LogoutButton />
          </div>
        </header>

        <div className="mx-auto max-w-[1040px] px-5 py-8 sm:px-8 sm:py-11 lg:px-12 lg:py-13">
          <div className="dashboard-reveal">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#747b75] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a]"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> 대시보드
            </Link>

            <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-[2rem] font-extrabold leading-tight tracking-[-0.04em] sm:text-[2.35rem]">
                    워크스페이스 설정
                  </h1>
                  <span className="rounded-full bg-[#e7f4ed] px-2.5 py-1 text-xs font-bold text-[#176a4b]">
                    {roleLabels[workspace.role]}
                  </span>
                </div>
                <p className="mt-3 text-[0.95rem] leading-7 text-[#707873]">
                  광고 결과의 기준이 되는 기본 정보를 관리합니다.
                </p>
              </div>
              <p className="text-xs text-[#8a8179]">
                마지막 변경 {formatDate(workspace.updatedAt)}
              </p>
            </div>
          </div>

          <div className="dashboard-reveal dashboard-delay-1 mt-10 grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-13">
            <nav aria-label="설정 메뉴" className="space-y-1 self-start lg:sticky lg:top-8">
              <SettingsAnchor href="#general" icon={Building2} active>
                기본 정보
              </SettingsAnchor>
              {members ? (
                <SettingsAnchor href="#members" icon={Users}>
                  멤버
                </SettingsAnchor>
              ) : null}
              <div className="flex min-h-10 items-center gap-2.5 px-3 text-sm font-semibold text-[#aaa39c]">
                <CreditCard aria-hidden="true" className="size-4" /> 결제 및 플랜
              </div>
            </nav>

            <div className="min-w-0">
              <section id="general" className="scroll-mt-8">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h2 className="text-xl font-extrabold tracking-[-0.025em]">
                      기본 정보
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#737973]">
                      리포트와 광고비 표시에 공통으로 적용됩니다.
                    </p>
                  </div>
                  {!canEdit ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#787f7a]">
                      <LockKeyhole aria-hidden="true" className="size-3.5" />
                      읽기 전용
                    </span>
                  ) : null}
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="mt-7 border-t border-[#ddd6ce]"
                >
                  <FormRow
                    htmlFor="workspace-name"
                    label="워크스페이스 이름"
                    description="메뉴와 리포트에 표시되는 이름"
                  >
                    <input
                      id="workspace-name"
                      value={form.name ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      disabled={!canEdit}
                      required
                      maxLength={120}
                      className="h-11 w-full rounded-lg border border-[#d9d1c8] bg-[#fffdf9] px-3.5 text-sm font-semibold outline-none transition focus:border-[#f26b3a] focus:ring-3 focus:ring-[#f26b3a]/12 disabled:bg-[#f2eee8] disabled:text-[#77716b]"
                    />
                  </FormRow>

                  <FormRow
                    htmlFor="workspace-currency"
                    label="기본 통화"
                    description="광고비와 성과 금액의 표시 기준"
                  >
                    <SelectField
                      id="workspace-currency"
                      value={form.defaultCurrency ?? "KRW"}
                      disabled={!canEdit}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          defaultCurrency: value,
                        }))
                      }
                      options={currencies}
                    />
                  </FormRow>

                  <FormRow
                    htmlFor="workspace-timezone"
                    label="시간대"
                    description="일별 광고 결과를 나누는 기준 시간"
                  >
                    <SelectField
                      id="workspace-timezone"
                      value={form.timezone ?? "Asia/Seoul"}
                      disabled={!canEdit}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          timezone: value,
                        }))
                      }
                      options={timezones}
                    />
                  </FormRow>

                  {message ? (
                    <div
                      role={message.type === "error" ? "alert" : "status"}
                      className={`mt-6 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm font-semibold ${
                        message.type === "success"
                          ? "bg-[#e7f4ed] text-[#176a4b]"
                          : "bg-[#fff0ec] text-[#a13d21]"
                      }`}
                    >
                      {message.type === "success" ? (
                        <CheckCircle2
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0"
                        />
                      ) : (
                        <ShieldCheck
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0"
                        />
                      )}
                      {message.text}
                    </div>
                  ) : null}

                  {canEdit ? (
                    <div className="mt-7 flex justify-end">
                      <button
                        type="submit"
                        disabled={!isDirty || isSaving}
                        className="inline-flex h-11 min-w-31 items-center justify-center gap-2 rounded-lg bg-[#18212f] px-4 text-sm font-bold text-[#fff8f2] transition-colors hover:bg-[#2a3545] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a] disabled:cursor-not-allowed disabled:bg-[#d7d0c8] disabled:text-[#8d857d]"
                      >
                        {isSaving ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <Save aria-hidden="true" className="size-4" />
                        )}
                        {isSaving ? "저장 중" : "변경사항 저장"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-7 flex items-start gap-2.5 border-t border-[#e5ded6] pt-5 text-sm leading-6 text-[#737973]">
                      <BadgeCheck
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-[#218a62]"
                      />
                      설정 변경은 소유자 또는 관리자에게 요청해 주세요.
                    </div>
                  )}
                </form>
              </section>

              {members ? (
                <section
                  id="members"
                  className="mt-15 scroll-mt-8 border-t border-[#d9d1c8] pt-10"
                >
                  <div className="flex items-end justify-between gap-5">
                    <div>
                      <h2 className="text-xl font-extrabold tracking-[-0.025em]">
                        멤버
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[#737973]">
                        이 워크스페이스에 접근할 수 있는 사용자입니다.
                      </p>
                    </div>
                    <span className="text-sm font-bold text-[#596372]">
                      {members.length}명
                    </span>
                  </div>

                  <div className="mt-7 overflow-hidden rounded-xl border border-[#e1d9d1] bg-[#fffdf9]">
                    {members.map((member, index) => (
                      <div
                        key={member.id}
                        className={`flex items-center gap-3.5 px-4 py-4 sm:px-5 ${
                          index ? "border-t border-[#eee7df]" : ""
                        }`}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#18212f] text-sm font-bold text-[#fff8f2]">
                          {(member.displayName || member.email)
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {member.displayName || member.email}
                          </span>
                          {member.displayName ? (
                            <span className="mt-0.5 block truncate text-xs text-[#89827b]">
                              {member.email}
                            </span>
                          ) : null}
                        </span>
                        <span className="hidden text-xs font-semibold text-[#686f69] sm:block">
                          {roleLabels[member.role]}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold ${getMemberStatusStyle(
                            member.status,
                          )}`}
                        >
                          {memberStatusLabels[member.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      <nav
        aria-label="모바일 주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t border-[#e7ded5] bg-[#fffdf9]/95 px-3 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden"
      >
        <MobileLink href="/" icon={Home} label="홈" />
        <MobileLink
          href={`/workspaces/${workspace.id}/settings`}
          icon={Settings2}
          label="설정"
          current
        />
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      aria-label="GrowdoAds 홈"
      className="inline-flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f26b3a]"
    >
      <span
        aria-hidden="true"
        className="relative flex size-7 items-center justify-center"
      >
        <span className="absolute size-6 rotate-45 rounded-[7px] bg-[#f26b3a]" />
        <span className="relative size-2 rounded-full bg-[#fff8f2]" />
      </span>
      <span className="text-[1.2rem] font-black tracking-[-0.04em]">
        Growdo<span className="text-[#f26b3a]">Ads</span>
      </span>
    </Link>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  current = false,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  current?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[0.94rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] ${
        current
          ? "bg-[#feeae2] text-[#b43c18]"
          : "text-[#657080] hover:bg-[#f4efe9] hover:text-[#18212f]"
      }`}
    >
      <Icon aria-hidden="true" className="size-[19px]" />
      {label}
    </Link>
  );
}

function SettingsAnchor({
  href,
  icon: Icon,
  active = false,
  children,
}: {
  href: string;
  icon: typeof Home;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#f26b3a] ${
        active
          ? "bg-[#eee9e3] text-[#18212f]"
          : "text-[#747b75] hover:bg-[#f2ede7] hover:text-[#18212f]"
      }`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </a>
  );
}

function FormRow({
  htmlFor,
  label,
  description,
  children,
}: {
  htmlFor: string;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 border-b border-[#e5ded6] py-6 sm:grid-cols-[minmax(170px,0.75fr)_minmax(240px,1fr)] sm:items-center sm:gap-8">
      <div>
        <label htmlFor={htmlFor} className="text-sm font-bold">
          {label}
        </label>
        <p className="mt-1 text-xs leading-5 text-[#878079]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SelectField({
  id,
  value,
  disabled,
  onChange,
  options,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-[#d9d1c8] bg-[#fffdf9] px-3.5 pr-10 text-sm font-semibold outline-none transition focus:border-[#f26b3a] focus:ring-3 focus:ring-[#f26b3a]/12 disabled:bg-[#f2eee8] disabled:text-[#77716b]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-[#79726b]"
      />
    </div>
  );
}

function MobileLink({
  href,
  icon: Icon,
  label,
  current = false,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  current?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex min-h-13 flex-col items-center justify-center gap-1 rounded-lg text-[0.68rem] font-bold focus-visible:outline-2 focus-visible:outline-[#f26b3a] ${
        current ? "text-[#c04b24]" : "text-[#7f7a75]"
      }`}
    >
      <Icon aria-hidden="true" className="size-5" />
      {label}
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function getMemberStatusStyle(status: WorkspaceMemberStatus) {
  if (status === "active") return "bg-[#e7f4ed] text-[#176a4b]";
  if (status === "invited") return "bg-[#fff0d8] text-[#99550b]";
  return "bg-[#ede9e5] text-[#706a64]";
}
