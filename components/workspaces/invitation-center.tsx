"use client";

import {
  Building2,
  Check,
  LoaderCircle,
  MailCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type {
  WorkspaceInvitation,
  WorkspaceRole,
} from "@/lib/workspaces/types";

const roleLabels: Record<WorkspaceRole, string> = {
  owner: "소유자",
  admin: "관리자",
  marketer: "마케터",
  viewer: "조회자",
};

type InvitationAction = "accept" | "decline";

export function InvitationCenter({
  initialInvitations,
}: {
  initialInvitations: WorkspaceInvitation[];
}) {
  const router = useRouter();
  const [invitations, setInvitations] = useState(initialInvitations);
  const [pending, setPending] = useState<{
    id: string;
    action: InvitationAction;
  }>();
  const [error, setError] = useState<string>();

  async function respond(
    invitation: WorkspaceInvitation,
    action: InvitationAction,
  ) {
    setPending({ id: invitation.id, action });
    setError(undefined);

    try {
      const response = await fetch(
        `/api/workspaces/invitations/${invitation.id}${
          action === "accept" ? "/accept" : ""
        }`,
        { method: action === "accept" ? "POST" : "DELETE" },
      );

      if (response.status === 401) {
        window.location.assign(
          `/api/auth/session?returnTo=${encodeURIComponent("/invitations")}`,
        );
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          code?: string;
          message?: string | string[];
        } | null;
        setError(getInvitationError(payload));
        return;
      }

      setInvitations((current) =>
        current.filter(({ id }) => id !== invitation.id),
      );

      if (action === "accept") {
        router.push(`/workspaces/${invitation.workspaceId}/settings`);
        router.refresh();
      }
    } catch {
      setError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setPending(undefined);
    }
  }

  if (invitations.length === 0) {
    return (
      <section className="border-y border-[#ded7cf] py-13 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#e7f4ed] text-[#176a4b]">
          <MailCheck aria-hidden="true" className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-extrabold">확인할 초대가 없습니다</h2>
        <p className="mt-2 text-sm leading-6 text-[#74716c]">
          새로운 워크스페이스 초대가 오면 이곳에 표시됩니다.
        </p>
      </section>
    );
  }

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-[#fff0ec] px-4 py-3 text-sm font-semibold text-[#a13d21]"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#dfd7cf] bg-[#fffdf9]">
        {invitations.map((invitation, index) => {
          const isPending = pending?.id === invitation.id;

          return (
            <article
              key={invitation.id}
              className={`grid gap-5 px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6 ${
                index ? "border-t border-[#ece5dd]" : ""
              }`}
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-[#18212f] text-[#fff8f2]">
                <Building2 aria-hidden="true" className="size-5" />
              </span>

              <div className="min-w-0">
                <h2 className="truncate text-base font-extrabold">
                  {invitation.workspaceName}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#737973]">
                  {roleLabels[invitation.role]} 권한으로 함께하도록 초대받았습니다.
                </p>
                <p className="mt-1 text-xs text-[#918981]">
                  {formatInvitationDate(invitation.invitedAt)}
                </p>
              </div>

              <div className="flex gap-2 sm:justify-end">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => respond(invitation, "decline")}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#d9d1c8] px-3.5 text-sm font-bold text-[#666d68] transition-colors hover:bg-[#f4efe9] hover:text-[#18212f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] disabled:cursor-wait disabled:opacity-55"
                >
                  {pending?.id === invitation.id &&
                  pending.action === "decline" ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <X aria-hidden="true" className="size-4" />
                  )}
                  거절
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => respond(invitation, "accept")}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#f26b3a] px-4 text-sm font-bold text-[#fff8f2] transition-colors hover:bg-[#df582b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] disabled:cursor-wait disabled:bg-[#d7a18e]"
                >
                  {pending?.id === invitation.id &&
                  pending.action === "accept" ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Check aria-hidden="true" className="size-4" />
                  )}
                  초대 수락
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function formatInvitationDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getInvitationError(payload: {
  code?: string;
  message?: string | string[];
} | null) {
  if (payload?.code === "ENTITLEMENT_LIMIT_EXCEEDED") {
    return "이 워크스페이스의 멤버 한도가 가득 찼습니다. 관리자에게 문의해 주세요.";
  }
  const message = Array.isArray(payload?.message)
    ? payload.message[0]
    : payload?.message;
  return message || "초대를 처리하지 못했습니다. 다시 시도해 주세요.";
}
