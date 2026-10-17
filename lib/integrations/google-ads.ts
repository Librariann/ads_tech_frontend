export type GoogleAdsConnection = { id: string; status: string };
export type GoogleAdsRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;
export type GoogleAdsAccountCreation = {
  id: string;
  requestId: string;
  status: "creating" | "created" | "unknown" | "failed" | "connected";
  name: string;
  currencyCode: string;
  timeZone: string;
  invitationEmail: string;
  customerId?: string | null;
  invitationStatus: "pending" | "sent" | "failed" | "unknown";
  errorCode?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type GoogleAdsCreationAvailability = {
  availability:
    | "available"
    | "not_configured"
    | "manager_access_required"
    | "not_eligible"
    | "temporarily_unavailable"
    | "subscription_required";
  code?: string;
  latestRequest?: GoogleAdsAccountCreation | null;
};

export function googleAdsCreationError(code?: string) {
  if (code === "GOOGLE_ADS_ACCOUNT_CREATION_API_ACCESS_REQUIRED") return "서비스의 Google Ads API 기본 접근 권한 승인이 필요합니다. 서비스 관리자가 Cloud 콘솔에서 권한을 확인해야 합니다. 기존 계정 연결은 이용할 수 있습니다.";
  if (code === "GOOGLE_ADS_ACCOUNT_CREATION_NOT_CONFIGURED")
    return "서비스의 Google 광고계정 생성 설정이 아직 준비되지 않았습니다. 기존 계정 연결은 이용할 수 있습니다.";
  if (code === "GOOGLE_ADS_MANAGER_ACCESS_REQUIRED")
    return "서비스의 Google 관리자 인증을 확인해야 합니다. 관리자에게 문의해 주세요.";
  if (code === "GOOGLE_ADS_ACCOUNT_CREATION_NOT_ELIGIBLE")
    return "Google의 광고계정 생성 이용 조건을 아직 충족하지 못했습니다. 서비스 관리자에게 문의해 주세요.";
  if (code === "GOOGLE_ADS_ACCOUNT_CREATION_REQUEST_MISMATCH")
    return "이전 생성 요청과 입력 정보가 다릅니다. 먼저 생성 요청 상태를 다시 확인해 주세요.";
  if (code === "GOOGLE_ADS_ACCOUNT_CREATION_IN_PROGRESS")
    return "이미 진행 중인 생성 요청이 있습니다. 요청 상태를 다시 확인해 주세요.";
  if (code === "GOOGLE_ADS_ACCOUNT_CREATION_UNKNOWN")
    return "계정 생성 결과를 확인하지 못했습니다. 중복 생성을 방지하기 위해 새 요청을 중단했습니다. 관리자에게 확인을 요청해 주세요.";
  return "Google 광고계정 생성 요청을 처리하지 못했습니다. 요청 상태를 다시 확인해 주세요.";
}
export type GoogleAdsAccount = {
  id: string;
  connectionId: string;
  externalAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
};
export type AvailableGoogleAdsAccount = {
  customerId: string;
  name: string;
  currencyCode: string;
  timeZone: string;
  manager: boolean;
  status: string;
  loginCustomerId?: string;
};
export type GoogleAdsOnboarding = {
  status:
    | "subscription_required"
    | "authorization_required"
    | "reauthorization_required"
    | "account_setup_required"
    | "account_selection_required"
    | "connected"
    | "account_limit_reached";
  reason?:
    | "no_accounts"
    | "account_not_enabled"
    | "manager_only"
    | "no_enabled_accounts";
  connectionId?: string;
  connections: GoogleAdsConnection[];
  accounts: GoogleAdsAccount[];
  availableAccounts: AvailableGoogleAdsAccount[];
  reservedCustomerIds?: string[];
  entitlement: { currentUsage: number; limit: number | null } | null;
};

export function googleAdsStep(status: GoogleAdsOnboarding["status"]) {
  if (status === "subscription_required") return 0;
  if (
    status === "authorization_required" ||
    status === "reauthorization_required"
  )
    return 1;
  return status === "connected" ? 3 : 2;
}

export function selectableGoogleAdsAccounts(snapshot: GoogleAdsOnboarding) {
  const { entitlement } = snapshot;
  const full =
    entitlement?.limit != null && entitlement.currentUsage >= entitlement.limit;
  return snapshot.availableAccounts.filter(
    (candidate) =>
      !full ||
      snapshot.reservedCustomerIds?.includes(candidate.customerId) ||
      snapshot.accounts.some(
        (account) =>
          account.externalAccountId === candidate.customerId &&
          account.status !== "disconnected" &&
          snapshot.connections.some(
            (connection) =>
              connection.id === account.connectionId &&
              ["reauth_required", "revoked"].includes(connection.status),
          ),
      ),
  );
}

export function googleAdsSetupCopy(reason?: GoogleAdsOnboarding["reason"]) {
  if (reason === "account_not_enabled" || reason === "no_enabled_accounts") {
    return {
      title: "광고계정 상태 확인이 필요합니다",
      description:
        "Google 인증은 완료됐지만 활성 광고계정을 확인하지 못했습니다. Google Ads에서 가입 미완료 또는 계정 비활성화 안내를 확인해 주세요.",
    };
  }
  if (reason === "manager_only") {
    return {
      title: "광고를 집행할 계정이 필요합니다",
      description:
        "관리자 계정만 확인됐습니다. Google Ads에서 광고주 계정을 생성하거나 연결한 뒤 다시 확인해 주세요.",
    };
  }
  return {
    title: "연결할 광고계정이 없습니다",
    description:
      "인증한 Google 계정에서 광고계정을 찾지 못했습니다. 새 광고계정을 만들거나, 기존 광고계정에 접근 가능한 다른 Google 계정으로 인증해 주세요.",
  };
}

export function formatGoogleAdsId(id: string) {
  return id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
}

export function googleAdsErrorMessage(code?: string, status?: number) {
  if (
    code?.startsWith("GOOGLE_ADS_ACCOUNT_CREATION_") ||
    code === "GOOGLE_ADS_MANAGER_ACCESS_REQUIRED"
  )
    return googleAdsCreationError(code);
  if (code === "GOOGLE_ADS_API_ERROR")
    return "Google Ads에서 계정 정보를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.";
  if (code === "ACTIVE_SUBSCRIPTION_REQUIRED")
    return "이용 가능한 구독이 필요합니다. 플랜 상태를 확인해 주세요.";
  if (code === "GOOGLE_ADS_REAUTH_REQUIRED")
    return "Google 접근 권한이 만료됐습니다. Google 계정을 다시 인증해 주세요.";
  if (code === "ENTITLEMENT_LIMIT_EXCEEDED")
    return "현재 플랜의 광고계정 연결 한도에 도달했습니다.";
  if (code === "GOOGLE_ADS_ACCOUNT_ALREADY_REGISTERED")
    return "이미 연결된 광고계정입니다. 연결 상태를 다시 확인해 주세요.";
  if (status === 403) return "광고계정 연결은 소유자 또는 관리자만 가능합니다.";
  if (status === 404)
    return "인증 연결을 찾을 수 없습니다. 연결 상태를 다시 확인해 주세요.";
  if (status === 503)
    return "연결 서버를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.";
  return "요청을 처리하지 못했습니다. 잠시 후 다시 확인해 주세요.";
}
