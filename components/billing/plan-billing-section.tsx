"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  requestPayment,
  type MockPaymentScenario,
  type PaymentResult,
} from "pay-rehearsal";
import { useState } from "react";
import Link from "next/link";

import type { BillingSummary, WorkspaceRole } from "@/lib/workspaces/types";

const scenarioOptions: Array<{
  value: MockPaymentScenario;
  label: string;
}> = [
  { value: "success", label: "결제 성공" },
  { value: "failure", label: "결제 실패" },
  { value: "cancelled", label: "사용자 취소" },
  { value: "random", label: "무작위 결과" },
];

export function PlanBillingSection({
  workspaceId,
  role,
  initialSummary,
}: {
  workspaceId: string;
  role: WorkspaceRole;
  initialSummary: BillingSummary;
}) {
  const [scenario, setScenario] = useState<MockPaymentScenario>("success");
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState<PaymentResult>();
  const [error, setError] = useState<string>();
  const [currentPlanCode, setCurrentPlanCode] = useState(
    initialSummary.currentPlanCode,
  );
  const canManageBilling = role === "owner";
  const proPlan = initialSummary.plans.find((plan) => plan.code === "pro");

  async function checkout() {
    if (!canManageBilling || isOpen || currentPlanCode === "pro") return;

    setResult(undefined);
    setError(undefined);
    setIsOpen(true);

    try {
      if (!proPlan) {
        throw new Error("Pro 플랜 정보를 찾을 수 없습니다.");
      }

      const idempotencyKey = getOrCreateIdempotencyKey(workspaceId);
      const prepared = await postPayment<PreparedPayment>(
        workspaceId,
        "prepare",
        { planCode: proPlan.code, idempotencyKey },
      );
      if (prepared.status === "succeeded") {
        setCurrentPlanCode(proPlan.code);
        clearIdempotencyKey(workspaceId);
        return;
      }
      if (prepared.status !== "pending") {
        clearIdempotencyKey(workspaceId);
        throw new Error("이전 결제 시도가 종료되었습니다. 다시 시도해 주세요.");
      }
      const paymentResult = await requestPayment(
        {
          orderId: prepared.orderId,
          orderName: prepared.orderName,
          amount: prepared.amount,
          currency: prepared.currency,
          metadata: {
            workspaceId,
            planCode: proPlan.code,
            attemptId: prepared.attemptId,
          },
        },
        {
          result: scenario,
          delayMs: 900,
          paymentMethods: [
            "card",
            "bank-transfer",
            "virtual-account",
            "mobile",
            "paypal",
          ],
          defaultPaymentMethod: "card",
          virtualAccountHolder: "GrowdoAds 테스트",
          virtualAccountDueHours: 24,
          theme: {
            accentColor: "#f26b3a",
            borderRadius: 10,
            fontFamily: "var(--font-noto-sans-kr)",
          },
        },
      );

      const confirmation = await postPayment<ConfirmedPayment>(
        workspaceId,
        "confirm",
        toConfirmationPayload(idempotencyKey, paymentResult),
      );
      if (confirmation.status === "succeeded") {
        setCurrentPlanCode(confirmation.planCode);
      }
      if (confirmation.status !== "pending") {
        clearIdempotencyKey(workspaceId);
      }
      setResult(paymentResult);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "결제를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setIsOpen(false);
    }
  }

  return (
    <section
      id="billing"
      className="mt-15 scroll-mt-8 border-t border-[#d9d1c8] pt-10"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-extrabold">결제 및 플랜</h2>
            <span className="rounded-full bg-[#fff0e9] px-2.5 py-1 text-[0.68rem] font-bold text-[#b43c18]">
              TEST
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#737973]">
            현재 플랜과 월간 사용 한도를 관리합니다.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#737973]">
          <ShieldCheck aria-hidden="true" className="size-4 text-[#218a62]" />
          카드 정보를 저장하지 않음
        </span>
      </div>

      <div className="mt-7 flex items-start gap-3 border-y border-[#e7d8cc] bg-[#fff7f1] px-4 py-3.5 text-sm leading-6 text-[#75412f]">
        <CircleAlert
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-[#d3542b]"
        />
        <p>
          테스트 결제입니다. 실제 청구는 발생하지 않지만 승인 결과는 테스트
          구독에 반영됩니다.
        </p>
      </div>

      <div className="mt-8 grid overflow-hidden rounded-lg border border-[#ded7cf] bg-[#fffdf9] md:grid-cols-2">
        <PlanColumn
          name="Starter"
          price="무료"
          description="광고 운영을 시작하는 소규모 워크스페이스"
          features={["광고계정 2개", "기본 성과 리포트", "멤버 3명"]}
          current={currentPlanCode === "starter"}
        />

        <div className="border-t border-[#ded7cf] p-5 sm:p-6 md:border-l md:border-t-0">
          <div className="flex min-h-7 items-center justify-between gap-3">
            <h3 className="text-base font-extrabold">Pro</h3>
            <span className="text-xs font-bold text-[#b43c18]">월간</span>
          </div>
          <p className="mt-4 text-2xl font-black">
            {proPlan ? formatCurrency(proPlan.priceAmount) : "플랜 준비 중"}
            <span className="ml-1 text-xs font-semibold text-[#858079]">
              /월
            </span>
          </p>
          <p className="mt-2 min-h-10 text-sm leading-5 text-[#77716b]">
            여러 광고계정과 팀 운영이 필요한 워크스페이스
          </p>
          <ul className="mt-5 space-y-2.5">
            {["광고계정 10개", "확장 성과 리포트", "멤버 10명"].map(
              (feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 text-sm font-semibold text-[#4c554f]"
                >
                  <Check
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[#d3542b]"
                  />
                  {feature}
                </li>
              ),
            )}
          </ul>

          <div className="mt-6 border-t border-[#eee7df] pt-5">
            {currentPlanCode === "pro" ? (
              <p className="mb-3 text-xs font-bold text-[#176a4b]">
                현재 사용 중인 플랜입니다.
              </p>
            ) : null}
            {canManageBilling ? (
              <>
                <label
                  htmlFor="mock-payment-result"
                  className="text-xs font-bold text-[#69645f]"
                >
                  테스트 결과
                </label>
                <select
                  id="mock-payment-result"
                  value={scenario}
                  onChange={(event) =>
                    setScenario(event.target.value as MockPaymentScenario)
                  }
                  disabled={isOpen || currentPlanCode === "pro"}
                  className="mt-2 h-10 w-full rounded-lg border border-[#d9d1c8] bg-[#fffdf9] px-3 text-sm font-semibold outline-none transition focus:border-[#f26b3a] focus:ring-3 focus:ring-[#f26b3a]/12 disabled:cursor-not-allowed disabled:bg-[#f2eee8]"
                >
                  {scenarioOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={checkout}
                  disabled={isOpen || currentPlanCode === "pro"}
                  className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#18212f] px-4 text-sm font-bold text-[#fff8f2] transition-colors hover:bg-[#2a3545] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#f26b3a] disabled:cursor-wait disabled:bg-[#aaa39c]"
                >
                  {isOpen ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <CreditCard aria-hidden="true" className="size-4" />
                  )}
                  {isOpen
                    ? "결제 진행 중"
                    : currentPlanCode === "pro"
                    ? "Pro 사용 중"
                    : "Pro 테스트 결제"}
                </button>
              </>
            ) : (
              <p className="flex items-start gap-2 text-sm leading-6 text-[#77716b]">
                <LockKeyhole
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0"
                />
                플랜 결제는 워크스페이스 소유자만 진행할 수 있습니다.
              </p>
            )}
          </div>
        </div>
      </div>

      <div aria-live="polite">
        {result ? <PaymentResultPanel result={result} /> : null}
        {error ? (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 border-t border-[#edcfc4] pt-4 text-sm font-semibold text-[#a13d21]"
          >
            <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}
      </div>
      {currentPlanCode && (role === "owner" || role === "admin") ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#ded7cf] pt-5">
          <p className="text-sm font-semibold text-[#176a4b]">
            이용 플랜이 준비됐습니다.
          </p>
          <Link
            href={`/workspaces/${workspaceId}/advertising`}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#176a4b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12563d]"
          >
            광고계정 등록하기
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function PlanColumn({
  name,
  price,
  description,
  features,
  current,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  current?: boolean;
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-base font-extrabold">{name}</h3>
        {current ? (
          <span className="rounded-full bg-[#e7f4ed] px-2.5 py-1 text-[0.68rem] font-bold text-[#176a4b]">
            현재 플랜
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-2xl font-black">{price}</p>
      <p className="mt-2 min-h-10 text-sm leading-5 text-[#77716b]">
        {description}
      </p>
      <ul className="mt-5 space-y-2.5">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-center gap-2 text-sm font-semibold text-[#4c554f]"
          >
            <Check
              aria-hidden="true"
              className="size-4 shrink-0 text-[#218a62]"
            />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentResultPanel({ result }: { result: PaymentResult }) {
  if (result.status === "success") {
    return (
      <ResultShell
        icon={CheckCircle2}
        title="테스트 결제가 승인되었습니다"
        tone="success"
      >
        승인 번호 {result.paymentId} · {formatDateTime(result.approvedAt)}
      </ResultShell>
    );
  }

  if (result.status === "pending") {
    return (
      <ResultShell
        icon={Clock3}
        title="입금을 기다리고 있습니다"
        tone="pending"
      >
        {result.virtualAccount.accountHolder} ·{" "}
        {result.virtualAccount.accountNumber}
        <br />
        입금 기한 {formatDateTime(result.virtualAccount.dueAt)}
      </ResultShell>
    );
  }

  if (result.status === "failed") {
    return (
      <ResultShell
        icon={XCircle}
        title="테스트 결제에 실패했습니다"
        tone="error"
      >
        {result.message} ({result.code})
      </ResultShell>
    );
  }

  return (
    <ResultShell icon={RotateCcw} title="결제를 취소했습니다" tone="neutral">
      요금은 청구되지 않았습니다.
    </ResultShell>
  );
}

function ResultShell({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof ReceiptText;
  title: string;
  tone: "success" | "pending" | "error" | "neutral";
  children: React.ReactNode;
}) {
  const toneStyles = {
    success: "border-[#b9ddcc] text-[#176a4b]",
    pending: "border-[#ead39b] text-[#795b10]",
    error: "border-[#edcfc4] text-[#a13d21]",
    neutral: "border-[#d9d1c8] text-[#606762]",
  };

  return (
    <div
      className={`mt-5 flex items-start gap-3 border-t pt-4 ${toneStyles[tone]}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-extrabold">{title}</p>
        <p className="mt-1 break-words text-xs leading-5">{children}</p>
        <p className="mt-1 text-xs font-semibold">
          Mock 결제 결과가 테스트 구독 상태에 반영됩니다.
        </p>
      </div>
    </div>
  );
}

type PreparedPayment = {
  attemptId: string;
  idempotencyKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  currency: "KRW" | "USD" | "JPY" | "EUR";
  status: "pending" | "succeeded" | "failed" | "canceled";
  expiresAt: string;
};

type ConfirmedPayment = {
  attemptId: string;
  orderId: string;
  status: "pending" | "succeeded" | "failed" | "canceled";
  planCode: string;
};

async function postPayment<T>(
  workspaceId: string,
  action: "prepare" | "confirm",
  body: unknown,
) {
  const response = await fetch(
    `/api/workspaces/${workspaceId}/billing/mock-payments/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string | string[] })
    | null;

  if (response.status === 401) {
    window.location.href = `/api/auth/session?returnTo=${encodeURIComponent(
      window.location.pathname,
    )}`;
    throw new Error("로그인이 필요합니다.");
  }
  if (!response.ok || !payload) {
    const message = Array.isArray(payload?.message)
      ? payload.message[0]
      : payload?.message;
    throw new Error(message || "결제를 처리하지 못했습니다.");
  }

  return payload;
}

function toConfirmationPayload(idempotencyKey: string, result: PaymentResult) {
  return {
    idempotencyKey,
    orderId: result.orderId,
    status: result.status,
    amount: result.amount,
    testMode: result.testMode,
    method: result.method,
    paymentId: "paymentId" in result ? result.paymentId : undefined,
    approvedAt: "approvedAt" in result ? result.approvedAt : undefined,
    code: "code" in result ? result.code : undefined,
    message: "message" in result ? result.message : undefined,
    reason: "reason" in result ? result.reason : undefined,
  };
}

function getOrCreateIdempotencyKey(workspaceId: string) {
  const storageKey = `mock-payment-idempotency:${workspaceId}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const value = crypto.randomUUID();
  sessionStorage.setItem(storageKey, value);
  return value;
}

function clearIdempotencyKey(workspaceId: string) {
  sessionStorage.removeItem(`mock-payment-idempotency:${workspaceId}`);
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
