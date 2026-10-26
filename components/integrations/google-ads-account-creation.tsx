"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Link2,
  LoaderCircle,
  Mail,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
  formatGoogleAdsId,
  googleAdsCreationError,
  type GoogleAdsCreationAvailability,
  type GoogleAdsRequest,
} from "@/lib/integrations/google-ads";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#d7ddd8] px-4 py-2 text-sm font-semibold hover:bg-[#edf2ee] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#176a4b]";
const fieldClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-md border border-[#cdd6cf] bg-white px-3 py-2 text-sm outline-none focus:border-[#176a4b] focus:ring-2 focus:ring-[#176a4b]/15 disabled:bg-[#f1f4f1]";

export function GoogleAdsAccountCreation({
  workspaceId,
  workspaceName,
  request,
  onImport,
  onCreated,
}: {
  workspaceId: string;
  workspaceName: string;
  request: GoogleAdsRequest;
  onImport: () => void;
  onCreated: () => void;
}) {
  const [availability, setAvailability] =
    useState<GoogleAdsCreationAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(`${workspaceName} 광고계정`.slice(0, 160));
  const [invitationEmail, setInvitationEmail] = useState("");
  const [currencyCode, setCurrencyCode] = useState("KRW");
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  const [invitationConsent, setInvitationConsent] = useState(false);
  const [newRequest, setNewRequest] = useState(false);
  const sequence = useRef(0);
  const requestKey = useRef<string | null>(null);
  const storageKey = `google-ads-account-creation:v1:${workspaceId}`;
  const invalidate = useCallback(() => {
    sequence.current += 1;
  }, []);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<GoogleAdsCreationAvailability>(
        "account-creation",
      );
      if (sequence.current === current) setAvailability(result);
    } catch (cause) {
      if (sequence.current === current) {
        setAvailability((previous) => ({
          ...previous,
          availability: "temporarily_unavailable",
        }));
        setError(
          cause instanceof Error
            ? cause.message
            : "생성 요청 상태를 확인하지 못했습니다.",
        );
      }
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
    return invalidate;
  }, [invalidate, load]);

  function clearKey() {
    requestKey.current = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Server idempotency also protects storage-disabled browsers. */
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      busy ||
      loading ||
      availability?.availability !== "available" ||
      !invitationConsent
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (
        availability.latestRequest?.status === "failed" ||
        (availability.latestRequest?.status === "connected" && newRequest)
      )
        clearKey();
      if (!requestKey.current) {
        try {
          const stored = sessionStorage.getItem(storageKey);
          if (stored && /^[0-9a-f-]{36}$/i.test(stored))
            requestKey.current = stored;
        } catch {
          /* Keep the in-memory key if storage is unavailable. */
        }
        requestKey.current ??= crypto.randomUUID();
        try {
          sessionStorage.setItem(storageKey, requestKey.current);
        } catch {
          /* The durable request is stored by the backend. */
        }
      }
      const result = await request<
        NonNullable<GoogleAdsCreationAvailability["latestRequest"]>
      >("account-creations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: requestKey.current,
          name: name.trim(),
          invitationEmail: invitationEmail.trim(),
          currencyCode,
          timeZone,
          invitationConsent,
        }),
      });
      setAvailability((previous) =>
        previous ? { ...previous, latestRequest: result } : null,
      );
      setNewRequest(false);
      if (result.status === "failed") clearKey();
      onCreated();
    } catch (cause) {
      const failure =
        cause instanceof Error
          ? cause.message
          : "계정 생성을 요청하지 못했습니다.";
      await load();
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function retryInvitation() {
    const latest = availability?.latestRequest;
    if (
      !latest ||
      latest.status !== "created" ||
      latest.invitationStatus !== "failed" ||
      busy
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await request<typeof latest>(
        `account-creations/${latest.id}/retry-invitation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitationConsent: true }),
        },
      );
      setAvailability((previous) =>
        previous ? { ...previous, latestRequest: result } : null,
      );
    } catch (cause) {
      await load();
      setError(
        cause instanceof Error
          ? cause.message
          : "초대 발송 결과를 확인하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const latest = availability?.latestRequest;
  const showResult =
    latest &&
    latest.status !== "failed" &&
    !(latest.status === "connected" && newRequest);
  const canCreate =
    availability?.availability === "available" && !loading && !busy;
  const unavailableCode =
    availability?.code ??
    (
      {
        not_configured: "GOOGLE_ADS_ACCOUNT_CREATION_NOT_CONFIGURED",
        manager_access_required: "GOOGLE_ADS_MANAGER_ACCESS_REQUIRED",
        not_eligible: "GOOGLE_ADS_ACCOUNT_CREATION_NOT_ELIGIBLE",
      } as Record<string, string>
    )[availability?.availability ?? ""];

  return (
    <div className="py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">새 Google Ads 광고계정</h3>
          <p className="mt-2 text-sm leading-6 text-[#657168]">
            Google 계정으로 사용하는 이메일을 입력해 주세요. 생성된 광고계정의
            관리자 초대가 발송됩니다.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          onClick={() => void load()}
          disabled={loading || busy}
          title="생성 요청 상태 다시 확인"
          aria-label="생성 요청 상태 다시 확인"
        >
          <RefreshCw
            className={`size-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {loading && (
        <p
          role="status"
          className="mt-5 flex items-center gap-2 text-sm text-[#657168]"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          계정 생성 가능 여부를 확인하고 있습니다.
        </p>
      )}
      {!loading && availability?.availability === "subscription_required" ? (
        <div className="mt-5 border-y border-[#dce3dd] py-5">
          <p className="text-sm leading-6">
            광고계정을 만들기 전에 이용 가능한 플랜을 확인해 주세요.
          </p>
          <Link
            href={`/workspaces/${workspaceId}/settings#billing`}
            className={`${buttonClass} mt-4`}
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            플랜 확인
          </Link>
        </div>
      ) : (
        <>
          {!loading &&
            availability &&
            availability.availability !== "available" && (
              <p
                role="status"
                className="mt-5 border-y border-[#e4d9bb] bg-[#fffaf0] px-4 py-4 text-sm leading-6 text-[#71531b]"
              >
                {googleAdsCreationError(unavailableCode)}
              </p>
            )}
          {showResult ? (
            <div className="mt-6 border-y border-[#dce3dd] py-6">
              <h4 className="flex items-start gap-2 text-base font-bold">
                {latest.status === "created" ||
                latest.status === "connected" ? (
                  <CheckCircle2
                    className="size-5 shrink-0 text-[#176a4b]"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleAlert
                    className="size-5 shrink-0 text-[#9b5a22]"
                    aria-hidden="true"
                  />
                )}
                {latest.status === "connected"
                  ? "광고계정 연결 완료"
                  : latest.status === "created"
                  ? "광고계정 생성 완료 · 연결 대기"
                  : latest.status === "unknown"
                  ? "계정 생성 결과 확인이 필요합니다"
                  : "계정 생성 요청을 처리하고 있습니다"}
              </h4>
              <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
                <dt className="text-[#657168]">계정 이름</dt>
                <dd className="break-words font-semibold">{latest.name}</dd>
                {latest.customerId && (
                  <>
                    <dt className="text-[#657168]">계정 번호</dt>
                    <dd>{formatGoogleAdsId(latest.customerId)}</dd>
                  </>
                )}
                <dt className="text-[#657168]">초대 이메일</dt>
                <dd className="break-all">{latest.invitationEmail}</dd>
              </dl>
              {latest.status === "created" && (
                <>
                  <p className="mt-5 text-sm leading-6 text-[#657168]">
                    {latest.invitationStatus === "sent"
                      ? "입력한 이메일로 관리자 초대를 보냈습니다. Google 초대를 수락한 뒤 아래에서 계정을 불러와 연결해 주세요. 광고비 결제수단과 필요한 인증은 Google에서 직접 완료합니다."
                      : latest.invitationStatus === "failed"
                      ? "광고계정은 생성됐지만 관리자 초대 메일을 보내지 못했습니다. 새 계정을 만들지 않고 초대만 다시 보낼 수 있습니다."
                      : "광고계정은 생성됐지만 관리자 초대 발송 결과를 확인해야 합니다. 중복 발송하지 않고 상태를 다시 확인해 주세요."}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {latest.invitationStatus === "failed" ? (
                      <button
                        type="button"
                        onClick={retryInvitation}
                        disabled={busy || loading}
                        className={buttonClass}
                      >
                        <Mail className="size-4" aria-hidden="true" />
                        같은 이메일로 초대 다시 보내기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={onImport}
                      disabled={busy}
                      className={`${buttonClass} border-transparent bg-[#176a4b] text-white hover:bg-[#12563d]`}
                    >
                      <Link2 className="size-4" aria-hidden="true" />
                      초대 수락 후 계정 불러오기
                    </button>
                  </div>
                </>
              )}
              {(latest.status === "creating" ||
                latest.status === "unknown") && (
                <p className="mt-5 text-sm leading-6 text-[#71531b]">
                  {latest.status === "unknown"
                    ? "Google 응답을 확인하지 못해 추가 생성을 중단했습니다. 이미 계정이 생성됐을 수 있으므로 서비스 관리자에게 요청 번호를 전달해 주세요."
                    : "화면을 닫아도 요청 이력은 유지됩니다. 새 계정을 다시 만들지 말고 잠시 후 요청 상태를 확인해 주세요."}
                  <span className="mt-2 block break-all text-xs">
                    요청 번호: {latest.requestId}
                  </span>
                </p>
              )}
              {latest.status === "connected" && (
                <button
                  type="button"
                  onClick={() => {
                    clearKey();
                    setNewRequest(true);
                    setInvitationConsent(false);
                  }}
                  className={`${buttonClass} mt-5`}
                >
                  <Plus className="size-4" aria-hidden="true" />새 광고계정 추가
                </button>
              )}
            </div>
          ) : (
            <form
              onSubmit={create}
              className="mt-6 border-t border-[#dce3dd] pt-6"
            >
              {latest?.status === "failed" && (
                <p
                  role="status"
                  className="mb-5 text-sm leading-6 text-[#a23628]"
                >
                  이전 계정 생성 요청이 실패했습니다. 입력 정보를 확인한 뒤 새
                  요청으로 다시 시도할 수 있습니다.
                </p>
              )}
              <fieldset disabled={busy || loading} className="space-y-5">
                <div>
                  <label
                    htmlFor="new-google-ad-name"
                    className="text-sm font-semibold"
                  >
                    광고계정 이름
                  </label>
                  <input
                    id="new-google-ad-name"
                    name="name"
                    required
                    maxLength={160}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={fieldClass}
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-google-ad-email"
                    className="text-sm font-semibold"
                  >
                    관리자 초대를 받을 Google 계정 이메일
                  </label>
                  <input
                    id="new-google-ad-email"
                    name="invitationEmail"
                    type="email"
                    required
                    maxLength={254}
                    value={invitationEmail}
                    onChange={(event) => setInvitationEmail(event.target.value)}
                    className={fieldClass}
                    autoComplete="email"
                  />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="new-google-ad-currency"
                      className="text-sm font-semibold"
                    >
                      광고계정 통화
                    </label>
                    <select
                      id="new-google-ad-currency"
                      value={currencyCode}
                      onChange={(event) => setCurrencyCode(event.target.value)}
                      className={fieldClass}
                    >
                      <option value="KRW">대한민국 원 (KRW)</option>
                      <option value="USD">미국 달러 (USD)</option>
                      <option value="JPY">일본 엔 (JPY)</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="new-google-ad-timezone"
                      className="text-sm font-semibold"
                    >
                      시간대
                    </label>
                    <select
                      id="new-google-ad-timezone"
                      value={timeZone}
                      onChange={(event) => setTimeZone(event.target.value)}
                      className={fieldClass}
                    >
                      <option value="Asia/Seoul">서울 (UTC+9)</option>
                      <option value="Asia/Tokyo">도쿄 (UTC+9)</option>
                      <option value="America/New_York">뉴욕</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs leading-5 text-[#71531b]">
                  통화와 시간대는 계정 생성 후 변경할 수 없습니다.
                </p>
                <label className="flex items-start gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    checked={invitationConsent}
                    onChange={(event) =>
                      setInvitationConsent(event.target.checked)
                    }
                    required
                    className="mt-1 size-4 shrink-0 accent-[#176a4b]"
                  />
                  <span>
                    입력한 이메일로 새 광고계정의 관리자 초대를 보내는 데
                    동의합니다.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={
                    !canCreate ||
                    !name.trim() ||
                    !invitationEmail.trim() ||
                    !invitationConsent
                  }
                  className={`${buttonClass} border-transparent bg-[#176a4b] text-white hover:bg-[#12563d]`}
                >
                  {busy ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Plus className="size-4" aria-hidden="true" />
                  )}
                  {busy ? "계정 생성 요청 중" : "광고계정 만들고 초대 보내기"}
                </button>
              </fieldset>
              <p className="mt-4 text-xs leading-5 text-[#657168]">
                계정 생성만으로 광고가 집행되지는 않습니다. 광고비는 Google에
                직접 납부하며 서비스 구독료와 별개입니다.
              </p>
            </form>
          )}
        </>
      )}
      {error && (
        <p
          role="alert"
          className="mt-5 border-y border-[#eccbc5] bg-[#fff5f3] px-4 py-4 text-sm leading-6 text-[#a23628]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
