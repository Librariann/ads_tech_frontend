"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ExternalLink,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { GoogleAdsAccountCreation } from "@/components/integrations/google-ads-account-creation";
import {
  formatGoogleAdsId,
  googleAdsErrorMessage,
  googleAdsSetupCopy,
  selectableGoogleAdsAccounts,
  type GoogleAdsOnboarding,
} from "@/lib/integrations/google-ads";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d5dadd] px-4 py-2 text-sm font-medium transition-colors hover:bg-[#eef0f2] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176a4b]";
const primaryClass = `${buttonClass} border-transparent bg-[#18212f] text-white hover:bg-[#2a3545]`;

class IntegrationError extends Error {
  constructor(
    public code: string | undefined,
    status: number,
  ) {
    super(googleAdsErrorMessage(code, status));
  }
}

export function GoogleAdsSection({
  workspaceId,
  workspaceName = "새",
}: {
  workspaceId: string;
  workspaceName?: string;
}) {
  const base = `/api/workspaces/${workspaceId}/integrations/google-ads`;
  const [snapshot, setSnapshot] = useState<GoogleAdsOnboarding | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [callbackError, setCallbackError] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const requestId = useRef(0);
  const selectedConnection = useRef<string | undefined>(undefined);
  const setupOpened = useRef(false);
  const invalidateRequests = useCallback(() => {
    requestId.current += 1;
  }, []);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${base}/${path}`, {
        cache: "no-store",
        ...init,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (
          response.status === 401 &&
          payload.code !== "GOOGLE_ADS_REAUTH_REQUIRED"
        ) {
          window.location.assign(
            `/api/auth/session?returnTo=${encodeURIComponent(
              window.location.pathname,
            )}`,
          );
        }
        throw new IntegrationError(payload.code, response.status);
      }
      return payload as T;
    },
    [base],
  );

  const refresh = useCallback(
    async (connectionId?: string) => {
      const sequence = ++requestId.current;
      selectedConnection.current = connectionId;
      setLoading(true);
      setError("");
      setSelected("");
      try {
        const query = connectionId
          ? `?connectionId=${encodeURIComponent(connectionId)}`
          : "";
        const result = await request<GoogleAdsOnboarding>(`onboarding${query}`);
        if (sequence !== requestId.current) return;
        setSnapshot(result);
        selectedConnection.current = result.connectionId;
        return result;
      } catch (cause) {
        if (sequence !== requestId.current) return;
        setSnapshot(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "연결 정보를 불러오지 못했습니다.",
        );
      } finally {
        if (sequence === requestId.current) setLoading(false);
      }
    },
    [request],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = query.get("connectionId");
    startTransition(() => {
      setCallbackError(query.get("googleAds") === "connection_failed");
      if (query.get("googleAds") === "connected") {
        setMessage(
          "Google 인증이 완료됐습니다. 광고계정 연결 상태를 확인해 주세요.",
        );
      }
      void refresh(id && /^[1-9]\d*$/.test(id) ? id : undefined).then(
        (result) => {
          if (!result || query.get("googleAds") !== "connected") return;
          query.delete("googleAds");
          query.delete("connectionId");
          const search = query.toString();
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${search ? `?${search}` : ""}${
              window.location.hash
            }`,
          );
        },
      );
    });
    return invalidateRequests;
  }, [invalidateRequests, refresh]);

  useEffect(() => {
    const recheck = () => {
      if (!setupOpened.current || document.visibilityState !== "visible")
        return;
      setupOpened.current = false;
      setMessage("");
      void refresh(selectedConnection.current);
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [refresh]);

  async function connect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request<{ authorizationUrl: string }>(
        "oauth/start",
        { method: "POST" },
      );
      const url = new URL(result.authorizationUrl);
      if (url.origin !== "https://accounts.google.com")
        throw new Error("인증 주소를 확인할 수 없습니다.");
      window.location.assign(url.href);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Google 인증을 시작하지 못했습니다.",
      );
      setBusy(false);
    }
  }

  async function register() {
    const account = snapshot?.availableAccounts.find(
      (item) => `${item.customerId}:${item.loginCustomerId ?? ""}` === selected,
    );
    if (!account || !snapshot?.connectionId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: snapshot.connectionId,
          customerId: account.customerId,
          loginCustomerId: account.loginCustomerId,
        }),
      });
      await refresh(snapshot.connectionId);
      setMessage(
        account.testAccount
          ? "광고계정을 연결했습니다. 현재 연결 계정에서는 실제 광고 노출·과금이 발생하지 않습니다."
          : "광고계정을 연결했습니다. 광고가 자동으로 집행되지는 않습니다.",
      );
    } catch (cause) {
      if (
        cause instanceof IntegrationError &&
        [
          "GOOGLE_ADS_REAUTH_REQUIRED",
          "GOOGLE_ADS_ACCOUNT_ALREADY_REGISTERED",
          "ENTITLEMENT_LIMIT_EXCEEDED",
          "ACTIVE_SUBSCRIPTION_REQUIRED",
        ].includes(cause.code ?? "")
      )
        await refresh(snapshot.connectionId);
      setError(
        cause instanceof Error
          ? cause.message
          : "광고계정을 연결하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const status = snapshot?.status;
  const afterCreation = useCallback(() => {
    void refresh(selectedConnection.current);
  }, [refresh]);
  const entitlement = snapshot?.entitlement;
  const setup = googleAdsSetupCopy(snapshot?.reason);
  const candidates = snapshot ? selectableGoogleAdsAccounts(snapshot) : [];

  return (
    <section
      id="google-ads"
      aria-label="Google Ads 계정 등록"
      className="min-w-0"
    >
      {callbackError && (
        <p
          role="alert"
          className="mb-5 text-sm leading-6 text-[#a23628]"
        >
          Google 인증을 완료하지 못했습니다. 연결 상태를 확인한 뒤 필요한 경우
          다시 인증해 주세요.
        </p>
      )}
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">연결 관리</h2>
        {mode === "existing" ? <button
          type="button"
          title="연결 상태 다시 확인"
          aria-label="연결 상태 다시 확인"
          onClick={() => {
            setMessage("");
            void refresh(selectedConnection.current);
          }}
          disabled={loading || busy}
          className={buttonClass}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </button> : null}
      </div>
      <div className="mt-2">
        {entitlement && (
          <span className="text-sm text-[#657168]">
            전체 매체 광고계정 {entitlement.currentUsage} /{" "}
            {entitlement.limit ?? "무제한"}
          </span>
        )}
      </div>
      <fieldset className="mt-5 flex flex-wrap gap-1 rounded-md border border-[#d5dadd] bg-white p-1">
        <legend className="sr-only">광고계정 등록 방식</legend>
        {(
          [
            { value: "existing", label: "기존 광고계정 연결", icon: Link2 },
            { value: "new", label: "새 광고계정 만들기", icon: Plus },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={`relative flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium focus-within:outline-2 focus-within:outline-[#176a4b] ${
              mode === value
                ? "bg-[#eef0f2] text-[#18212f]"
                : "text-[#657168] hover:bg-[#f8f9fa]"
            }`}
          >
            <input
              type="radio"
              name="google-account-mode"
              value={value}
              checked={mode === value}
              onChange={() => {
                setMode(value);
                setError("");
                setMessage("");
              }}
              disabled={busy}
              className="sr-only"
            />
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </label>
        ))}
      </fieldset>
      {mode === "new" ? (
        <GoogleAdsAccountCreation
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          request={request}
          onCreated={afterCreation}
          onImport={() => {
            setMode("existing");
            void refresh(selectedConnection.current);
          }}
        />
      ) : (
        <>
          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 py-7 text-sm text-[#657168]"
            >
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              광고계정 상태를 확인하고 있습니다.
            </p>
          )}
          {!loading && snapshot && (
            <div className="py-6">
              {status === "subscription_required" && (
                <div>
                  <h3 className="text-sm font-semibold">
                    이용 플랜을 먼저 확인해 주세요
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#657168]">
                    현재 이용 가능한 구독이 없습니다. 플랜을 선택하거나 구독
                    상태를 확인해 주세요.
                  </p>
                  <Link
                    href={`/workspaces/${workspaceId}/settings#billing`}
                    className={`${primaryClass} mt-5`}
                  >
                    <ArrowRight className="size-4" aria-hidden="true" />
                    플랜 확인
                  </Link>
                </div>
              )}
              {(status === "authorization_required" ||
                status === "reauthorization_required") && (
                <div>
                  <h3 className="text-sm font-semibold">
                    {status === "reauthorization_required"
                      ? "Google 계정을 다시 인증해 주세요"
                      : "Google 인증이 필요합니다"}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#657168]">
                    {status === "reauthorization_required"
                      ? "광고계정 접근 권한이 만료됐습니다. 기존 광고계정에 접근 가능한 Google 계정으로 인증해 주세요."
                      : "광고계정에 접근할 수 있는 Google 계정으로 인증해 주세요."}
                  </p>
                  <button
                    type="button"
                    onClick={connect}
                    disabled={busy}
                    className={`${primaryClass} mt-5`}
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    {busy ? "인증 준비 중" : "Google 계정 인증"}
                  </button>
                </div>
              )}
              {snapshot.connectionId && snapshot.connections.filter((item) => item.status === "active").length > 1 &&
                status !== "authorization_required" &&
                status !== "reauthorization_required" &&
                status !== "subscription_required" && (
                  <div className="mb-6">
                    <label
                      htmlFor="google-connection"
                      className="text-xs font-semibold text-[#657168]"
                    >
                      Google 인증 연결
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        id="google-connection"
                        value={snapshot.connectionId}
                        onChange={(event) => {
                          setMessage("");
                          void refresh(event.target.value);
                        }}
                        disabled={busy}
                        className="min-h-11 min-w-0 flex-1 rounded-md border border-[#d5dadd] bg-white px-3 text-sm"
                      >
                        {snapshot.connections
                          .filter((item) => item.status === "active")
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              Google 인증 #{item.id}
                            </option>
                          ))}
                      </select>

                    </div>
                  </div>
                )}
              {status === "account_setup_required" && (
                <div>
                  <h3 className="text-sm font-semibold">
                    {setup.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#655c48]">
                    {setup.description}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">

                    <a
                      href="https://ads.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        setupOpened.current = true;
                      }}
                      className={buttonClass}
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      기존 계정 상태 확인
                      <span className="sr-only"> (새 탭)</span>
                    </a>

                  </div>
                </div>
              )}
              {status === "account_limit_reached" && (
                <div>
                  <h3 className="text-base font-bold">
                    광고계정 연결 한도에 도달했습니다
                  </h3>
                  <Link
                    href={`/workspaces/${workspaceId}/settings#billing`}
                    className={`${buttonClass} mt-4`}
                  >
                    <ArrowRight className="size-4" aria-hidden="true" />
                    플랜 확인
                  </Link>
                </div>
              )}
              {candidates.length > 0 && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void register();
                  }}
                >
                  <label
                    htmlFor="google-ad-account"
                    className="block text-base font-bold"
                  >
                    연결할 광고계정
                  </label>
                  <select
                    id="google-ad-account"
                    required
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                    disabled={busy}
                    className="mt-3 min-h-11 w-full min-w-0 rounded-md border border-[#d5dadd] bg-white px-3 text-sm"
                  >
                    <option value="">광고계정 선택</option>
                    {candidates.map((item) => (
                      <option
                        key={`${item.customerId}:${item.loginCustomerId ?? ""}`}
                        value={`${item.customerId}:${
                          item.loginCustomerId ?? ""
                        }`}
                      >
                        {item.name} ({formatGoogleAdsId(item.customerId)})
                        {snapshot.accounts.some(
                          (account) =>
                            account.externalAccountId === item.customerId,
                        )
                          ? " · 다시 연결"
                          : ""}
                      </option>
                    ))}
                  </select>
                  {candidates.some(
                    (item) =>
                      item.testAccount &&
                      `${item.customerId}:${item.loginCustomerId ?? ""}` ===
                        selected,
                  ) ? (
                    <p className="mt-3 text-sm leading-6 text-[#71531b]">
                      현재 연결 계정에서는 실제 광고가 노출되거나 광고비가
                      청구되지 않으며, 성과 수치는 비어 있습니다.
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={!selected || busy}
                    className={`${primaryClass} mt-4`}
                  >
                    {busy ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Link2 className="size-4" aria-hidden="true" />
                    )}
                    선택한 계정 연결
                  </button>
                </form>
              )}
              {snapshot.accounts.length > 0 && (
                <div className={candidates.length > 0 ? "mt-6 border-t border-[#e2e5e7] pt-5" : undefined}>
                  <h3 className="text-sm font-bold">등록된 광고계정</h3>
                  <ul className="mt-2 divide-y divide-[#e2e5e7]">
                    {snapshot.accounts.map((account) => {
                      const connection = snapshot.connections.find(
                        (item) => item.id === account.connectionId,
                      );
                      const active =
                        connection?.status === "active" &&
                        account.status === "active";
                      return (
                        <li
                          key={account.id}
                          className="flex flex-wrap items-start justify-between gap-2 py-4"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-sm font-semibold">
                              {account.name}
                            </p>
                            <p className="mt-1 break-words text-xs leading-5 text-[#657168]">
                              {formatGoogleAdsId(account.externalAccountId)} ·{" "}
                              {account.currency} · {account.timezone}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 text-xs font-semibold ${
                              active ? "text-[#176a4b]" : "text-[#9b5a22]"
                            }`}
                          >
                            {active
                              ? "등록됨"
                              : connection?.status === "reauth_required"
                                ? "재인증 필요"
                                : "연결 확인 필요"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-xs leading-5 text-[#657168]">계정 연결만으로 광고가 집행되지는 않습니다.</p>
                </div>
              )}
              {status !== "subscription_required" &&
                status !== "authorization_required" &&
                status !== "reauthorization_required" && (
                  <button
                    type="button"
                    onClick={connect}
                    disabled={busy}
                    className={`${buttonClass} mt-6`}
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    {busy ? "인증 준비 중" : "다른 Google 계정 인증"}
                  </button>
                )}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="my-5 text-sm leading-6 text-[#a23628]"
            >
              <p>{error}</p>

            </div>
          )}
          {!loading && message && status !== "connected" && (
            <p role="status" className="mt-4 text-sm leading-6 text-[#176a4b]">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
