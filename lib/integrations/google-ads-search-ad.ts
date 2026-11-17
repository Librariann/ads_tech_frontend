import stringWidth from "string-width";

export type PinnedAsset = { text: string; pinnedField: string | null };
export const assetIsPinned = (asset: PinnedAsset) => Boolean(asset.pinnedField && !["UNSPECIFIED", "UNKNOWN"].includes(asset.pinnedField));

export type SearchAd = {
  adGroupName: string;
  cpcBidMicros: string;
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
  keywords: string[];
  keywordMatchType: "EXACT" | "PHRASE" | "BROAD";
};

export const unsafeAdText = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;
export const googleAdWidth = (text: string) => stringWidth(text.trim());
const textKey = (text: string) => text.normalize("NFKC").toLowerCase();

export function publicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || unsafeAdText.test(value)) return false;
  const text = value.trim();
  if (text.length > 2048) return false;
  if (!/^https:\/\//i.test(text) || /[\s\\#]/u.test(text)) return false;
  const authority = text.slice(8).split(/[/?]/, 1)[0];
  if (/[:@%]/.test(authority)) return false;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
    const labels = url.hostname.split(".");
    const suffix = labels.at(-1)!;
    return url.hostname.length <= 253 && labels.length >= 2 &&
      labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) &&
      /^[a-z][a-z0-9-]*[a-z0-9]$/i.test(suffix) &&
      !["localhost", "local", "internal", "test", "invalid", "lan"].includes(suffix);
  } catch { return false; }
}

function assets(value: unknown, min: number, max: number, width: number): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
    !value.every((item) => typeof item === "string" && !unsafeAdText.test(item) &&
      !/[{}]/.test(item) && item.trim() && item.trim().length <= width && googleAdWidth(item) <= width)) return null;
  const texts = value.map((item: string) => item.trim());
  return new Set(texts.map(textKey)).size === texts.length ? texts : null;
}

function keywordTexts(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 ||
    !value.every((item) => typeof item === "string" && !unsafeAdText.test(item) &&
      !/[\[\]"{}]/.test(item) && item.trim() && item.trim().length <= 80 &&
      item.trim().split(/\s+/u).length <= 10)) return null;
  const keywords = value.map((item: string) => item.trim());
  return new Set(keywords.map(textKey)).size === keywords.length ? keywords : null;
}

export function searchAdInput(value: unknown): SearchAd | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ad = value as Record<string, unknown>;
  const keys = ["adGroupName", "cpcBidMicros", "finalUrl", "headlines", "descriptions", "keywords", "keywordMatchType"];
  if (Object.keys(ad).length !== keys.length || !keys.every((key) => Object.hasOwn(ad, key)) ||
    typeof ad.adGroupName !== "string" || unsafeAdText.test(ad.adGroupName) ||
    !ad.adGroupName.trim() || ad.adGroupName.trim().length > 128 ||
    typeof ad.cpcBidMicros !== "string" || !/^[1-9]\d{0,12}$(?![\s\S])/.test(ad.cpcBidMicros) ||
    BigInt(ad.cpcBidMicros) > BigInt("1000000000000") || !publicHttpsUrl(ad.finalUrl) ||
    typeof ad.keywordMatchType !== "string" || !["EXACT", "PHRASE", "BROAD"].includes(ad.keywordMatchType)) return null;
  const headlines = assets(ad.headlines, 3, 15, 30);
  const descriptions = assets(ad.descriptions, 2, 4, 90);
  const keywords = keywordTexts(ad.keywords);
  if (!headlines || !descriptions || !keywords) return null;
  return {
    adGroupName: ad.adGroupName.trim(), cpcBidMicros: ad.cpcBidMicros,
    finalUrl: ad.finalUrl.trim(), headlines, descriptions, keywords,
    keywordMatchType: ad.keywordMatchType as SearchAd["keywordMatchType"],
  };
}

export type SearchAdFields = {
  adGroupName: string;
  bid: string;
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
  keywords: string;
  keywordMatchType: SearchAd["keywordMatchType"];
};

export function validateSearchAdFields(fields: SearchAdFields, cpcBidMicros: string | null) {
  const keywords = fields.keywords.split(/\r?\n/).filter((line) => line.trim() !== "" || unsafeAdText.test(line));
  const candidate = {
    adGroupName: fields.adGroupName, cpcBidMicros, finalUrl: fields.finalUrl,
    headlines: fields.headlines, descriptions: fields.descriptions, keywords,
    keywordMatchType: fields.keywordMatchType,
  };
  const errors: Record<string, string> = {};
  if (!fields.adGroupName.trim() || fields.adGroupName.trim().length > 128 || unsafeAdText.test(fields.adGroupName)) errors.adGroupName = "광고그룹 이름은 특수 제어문자 없이 1~128자로 입력해 주세요.";
  if (!cpcBidMicros) errors.bid = "0보다 크고 1,000,000 이하인 금액을 소수점 6자리 이내로 입력해 주세요.";
  if (!publicHttpsUrl(fields.finalUrl)) errors.finalUrl = "포트, 로그인 정보, # 없이 공개 도메인의 HTTPS 주소를 입력해 주세요.";
  if (!assets(fields.headlines, 3, 15, 30)) errors.headlines = "서로 다른 광고 제목 3~15개를 입력해 주세요. 제목은 표시 폭 30 이내이며 제어문자와 중괄호를 사용할 수 없습니다.";
  if (!assets(fields.descriptions, 2, 4, 90)) errors.descriptions = "서로 다른 광고 설명 2~4개를 입력해 주세요. 설명은 표시 폭 90 이내이며 제어문자와 중괄호를 사용할 수 없습니다.";
  const searchAd = searchAdInput(candidate);
  if (!keywordTexts(keywords) || !["EXACT", "PHRASE", "BROAD"].includes(fields.keywordMatchType)) errors.keywords = "서로 다른 키워드 1~20개를 한 줄에 하나씩 입력해 주세요. 각 80자·10단어 이내이며 제어문자와 [ ] \" { }는 사용할 수 없습니다.";
  return { searchAd, errors };
}
