"use client";

import {
  CheckCircle2,
  Clock3,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  requestPayment,
  type MockPaymentScenario,
  type PaymentResult,
} from "pay-rehearsal";
import { useState } from "react";

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
      className="mt-10 scroll-mt-8 border-t border-[#d5dadd] pt-7"
    >
      <h2 className="text-base font-semibold">결제 및 플랜</h2>
      <p className="mt-2 text-xs leading-5 text-[#737973]">
        테스트 결제는 실제 청구 없이 테스트 구독에 반영됩니다.
      </p>

      <div className="mt-5 divide-y divide-[#e2e5e7] border-y border-[#e2e5e7]">
        {initialSummary.plans.map((plan) => (
          <div
            key={plan.code}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4"
          >
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">{plan.name}</h3>
              {currentPlanCode === plan.code ? (
                <span className="text-xs font-medium text-[#176a4b]">사용 중</span>
              ) : null}
            </div>
            <p className="text-sm tabular-nums">
              {formatCurrency(plan.priceAmount, plan.currency)}
              <span className="ml-1 text-xs text-[#737973]">
                /{plan.billingInterval === "year" ? "년" : "월"}
              </span>
            </p>
          </div>
        ))}
      </div>

      {!currentPlanCode ? (
        <p className="mt-3 text-sm text-[#737973]">사용 중인 플랜이 없습니다.</p>
      ) : initialSummary.currentPeriodEnd &&
        currentPlanCode === initialSummary.currentPlanCode ? (
        <p className="mt-3 text-xs text-[#737973]">
          이용 기간 종료 {formatDateTime(initialSummary.currentPeriodEnd)}
        </p>
      ) : null}

      {canManageBilling && currentPlanCode !== "pro" && proPlan ? (
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <details className="text-xs text-[#737973]">
            <summary className="cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-[#f26b3a]">
              테스트 옵션
            </summary>
            <label htmlFor="mock-payment-result" className="mt-2 block">
              결제 결과
            </label>
            <select
              id="mock-payment-result"
              value={scenario}
              onChange={(event) =>
                setScenario(event.target.value as MockPaymentScenario)
              }
              disabled={isOpen}
              className="mt-2 h-10 rounded-md border border-[#d5dadd] bg-[#ffffff] px-3 text-sm text-[#18212f] focus-visible:outline-2 focus-visible:outline-[#f26b3a]"
            >
              {scenarioOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </details>
          <button
            type="button"
            onClick={checkout}
            disabled={isOpen}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#18212f] px-4 text-sm font-medium text-[#ffffff] hover:bg-[#2a3545] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f26b3a] disabled:cursor-wait disabled:opacity-50"
          >
            {isOpen ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CreditCard aria-hidden="true" className="size-4" />
            )}
            {isOpen ? "결제 진행 중" : "Pro 테스트 결제"}
          </button>
        </div>
      ) : !canManageBilling ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-[#737973]">
          <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
          플랜 변경은 소유자만 가능합니다.
        </p>
      ) : null}

      <div aria-live="polite">
        {result ? <PaymentResultPanel result={result} /> : null}
        {error ? (
          <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-[#a13d21]">
            <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </section>
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
    neutral: "border-[#d5dadd] text-[#606762]",
  };

  return (
    <div
      className={`mt-5 flex items-start gap-3 border-t pt-4 ${toneStyles[tone]}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-extrabold">{title}</p>
        <p className="mt-1 break-words text-xs leading-5">{children}</p>
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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
