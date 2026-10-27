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
  Check,
  CheckCircle2,
  CircleAlert,
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
  googleAdsStep,
  selectableGoogleAdsAccounts,
  type GoogleAdsOnboarding,
} from "@/lib/integrations/google-ads";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d7ddd8] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[#edf2ee] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176a4b]";
const primaryClass = `${buttonClass} border-transparent bg-[#176a4b] text-white hover:bg-[#12563d]`;
const steps = ["이용 플랜", "Google 인증", "광고계정 확인", "연결 완료"];

class IntegrationError extends Error {
  constructor(public code: string | undefined, status: number) {
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
        "광고계정을 연결했습니다. 광고가 자동으로 집행되지는 않습니다.",
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
  const step = status ? googleAdsStep(status) : null;
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
          className="mb-5 border-y border-[#eccbc5] bg-[#fff5f3] px-4 py-4 text-sm leading-6 text-[#a23628]"
        >
          Google 인증을 완료하지 못했습니다. 연결 상태를 확인한 뒤 필요한 경우
          다시 인증해 주세요.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce3dd] pb-5">
        <h2 className="text-lg font-bold">Google Ads</h2>
        {entitlement && (
          <span className="text-sm text-[#657168]">
            전체 매체 광고계정 {entitlement.currentUsage} /{" "}
            {entitlement.limit ?? "무제한"}
          </span>
        )}
      </div>
      <fieldset className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <legend className="sr-only">광고계정 등록 방식</legend>
        {(
          [
            { value: "existing", label: "기존 광고계정 연결", icon: Link2 },
            { value: "new", label: "새 광고계정 만들기", icon: Plus },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-sm font-semibold ${
              mode === value
                ? "border-[#176a4b] bg-[#e7f4ed] text-[#176a4b]"
                : "border-[#d7ddd8] text-[#657168]"
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
              className="size-4 shrink-0 accent-[#176a4b]"
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
          <ol
            aria-label="등록 단계"
            className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-[#dce3dd] py-6 sm:grid-cols-4"
          >
            {steps.map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
                className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${
                  step !== null && index <= step
                    ? "text-[#176a4b]"
                    : "text-[#7a847c]"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                    step !== null && index <= step
                      ? "border-[#176a4b] bg-[#e7f4ed]"
                      : "border-[#cdd6cf]"
                  }`}
                >
                  {step !== null && (index < step || status === "connected") ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
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
            <div className="py-7">
              {status === "subscription_required" && (
                <div>
                  <h3 className="text-base font-bold">
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
                  <h3 className="text-base font-bold">
                    {status === "reauthorization_required"
                      ? "Google 계정을 다시 인증해 주세요"
                      : "광고를 운영할 Google 계정을 연결하세요"}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#657168]">
                    {status === "reauthorization_required"
                      ? "광고계정 접근 권한이 만료됐습니다. 기존 광고계정에 접근 가능한 Google 계정으로 인증해 주세요."
                      : "기존 광고계정에 접근할 수 있는 Google 계정으로 인증해 주세요. 광고계정이 없다면 새 광고계정 만들기를 선택해 주세요."}
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
              {snapshot.connectionId &&
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
                        className="min-h-11 min-w-0 flex-1 rounded-md border border-[#d7ddd8] bg-white px-3 text-sm"
                      >
                        {snapshot.connections
                          .filter((item) => item.status === "active")
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              Google 인증 #{item.id}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        title="연결 상태 다시 확인"
                        aria-label="연결 상태 다시 확인"
                        onClick={() => {
                          setMessage("");
                          void refresh(snapshot.connectionId);
                        }}
                        disabled={busy}
                        className={buttonClass}
                      >
                        <RefreshCw className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}
              {status === "account_setup_required" && (
                <div className="border-y border-[#e4d9bb] bg-[#fffaf0] px-4 py-5">
                  <h3 className="flex items-start gap-2 text-base font-bold text-[#71531b]">
                    <CircleAlert
                      className="mt-0.5 size-5 shrink-0"
                      aria-hidden="true"
                    />
                    {setup.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#655c48]">
                    {setup.description}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#655c48]">
                    기존 계정의 가입 미완료·비활성 상태는 Google에서 확인해
                    주세요. 별도 광고계정이 필요한 경우에는 여기에서 새 계정을
                    만들 수 있습니다.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("new")}
                      className={primaryClass}
                    >
                      <Plus className="size-4" aria-hidden="true" />새 광고계정
                      만들기
                    </button>
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
                    <button
                      type="button"
                      onClick={() => {
                        setMessage("");
                        void refresh(snapshot.connectionId);
                      }}
                      disabled={busy}
                      className={buttonClass}
                    >
                      <RefreshCw className="size-4" aria-hidden="true" />
                      설정 후 다시 확인
                    </button>
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
                    className="mt-3 min-h-11 w-full min-w-0 rounded-md border border-[#d7ddd8] bg-white px-3 text-sm"
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
              {status === "connected" && (
                <p
                  role="status"
                  className="flex items-start gap-2 text-sm font-semibold text-[#176a4b]"
                >
                  <CheckCircle2
                    className="size-5 shrink-0"
                    aria-hidden="true"
                  />
                  광고계정이 연결됐습니다. 연결만으로 광고가 집행되지는
                  않습니다.
                </p>
              )}
              {snapshot.accounts.length > 0 && (
                <div className="mt-6 border-t border-[#dce3dd] pt-5">
                  <h3 className="text-sm font-bold">등록된 광고계정</h3>
                  <ul className="mt-2 divide-y divide-[#dce3dd]">
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
              className="my-5 border-y border-[#eccbc5] bg-[#fff5f3] px-4 py-4 text-sm leading-6 text-[#a23628]"
            >
              <p>{error}</p>
              <button
                type="button"
                disabled={loading || busy}
                onClick={() => {
                  setMessage("");
                  void refresh();
                }}
                className={`${buttonClass} mt-3`}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                다시 확인
              </button>
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
