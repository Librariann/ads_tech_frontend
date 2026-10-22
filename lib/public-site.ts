export const publicSite = {
  name: "GrowdoAds",
  operator: "Growdo",
  businessName: "Growdo (그로우두)",
  description:
    "광고계정 연결과 워크스페이스 관리를 시작으로, 복잡한 광고 운영을 더 쉽게 만드는 서비스입니다.",
  url: getSiteUrl(),
  email: process.env.SITE_CONTACT_EMAIL?.trim() || "okpc0305@gmail.com",
  representative: process.env.SITE_REPRESENTATIVE?.trim() || "",
  businessNumber: process.env.SITE_BUSINESS_NUMBER?.trim() || "",
  address: process.env.SITE_BUSINESS_ADDRESS?.trim() || "",
  phone: process.env.SITE_CONTACT_PHONE?.trim() || "",
  commerceNumber: process.env.SITE_COMMERCE_NUMBER?.trim() || "",
  effectiveDate: "2026-11-02",
  hostingRegions: process.env.SITE_HOSTING_REGIONS?.trim() || "",
  logRetention: process.env.SITE_LOG_RETENTION?.trim() || "",
};

export const publicPaths = [
  "/",
  "/privacy",
  "/terms",
  "/data-deletion",
] as const;

function getSiteUrl() {
  const configured =
    process.env.SITE_URL || "https://ads-tech-frontend.vercel.app";
  try {
    const parsed = new URL(configured);
    if (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && parsed.hostname === "localhost")
    ) {
      return parsed.origin;
    }
  } catch {
    // Never emit malformed canonical URLs from deployment configuration.
  }
  return "https://ads-tech-frontend.vercel.app";
}
