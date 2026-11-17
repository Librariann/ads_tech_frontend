"use client";

import { Pin, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { assetIsPinned, googleAdWidth, type PinnedAsset, type SearchAdFields } from "@/lib/integrations/google-ads-search-ad";

export const campaignField = "mt-2 min-h-12 w-full min-w-0 rounded-md border border-[#cfc7bf] bg-white px-3 py-2 text-base focus:border-[#c04b24] focus:outline-2 focus:outline-[#c04b24] disabled:bg-[#e9ecef] disabled:text-[#8a929e] disabled:cursor-not-allowed disabled:opacity-100";
const field = campaignField;
const iconButton = "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-[#657080] hover:bg-[#f3eee8] focus-visible:outline-2 focus-visible:outline-[#c04b24] disabled:opacity-40";

export function GoogleAdsSearchAdFields({ fields, setFields, errors, disabled, currency, headlineAssets, descriptionAssets }: {
  fields: SearchAdFields;
  setFields: Dispatch<SetStateAction<SearchAdFields>>;
  errors: Record<string, string>;
  disabled: boolean;
  currency?: string;
  headlineAssets?: PinnedAsset[];
  descriptionAssets?: PinnedAsset[];
}) {
  function update<K extends keyof SearchAdFields>(key: K, value: SearchAdFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }
  const error = (key: string) => errors[key] ? <p id={`search-ad-${key}-error`} role="alert" className="mt-2 text-sm leading-6 text-[#a23428]">{errors[key]}</p> : null;
  const describedBy = (key: string) => errors[key] ? `search-ad-${key}-error` : undefined;
  const pins = { headlines: headlineAssets, descriptions: descriptionAssets };
  const pinnedSlots = [...(headlineAssets ?? []), ...(descriptionAssets ?? [])].some(assetIsPinned);

  return (
    <fieldset disabled={disabled} className="mt-8 min-w-0 border-t border-[#e9e2da] pt-6">
      <legend className="px-0 pt-6 text-lg font-bold">광고그룹과 검색광고</legend>
      <label htmlFor="search-ad-group" className="block text-sm font-bold">광고그룹 이름</label>
      <input id="search-ad-group" name="adGroupName" className={field} value={fields.adGroupName} onChange={(event) => update("adGroupName", event.target.value)} maxLength={128} required autoComplete="off" aria-invalid={Boolean(errors.adGroupName)} aria-describedby={describedBy("adGroupName")} />
      {error("adGroupName")}
      <label htmlFor="search-ad-bid" className="mt-6 block text-sm font-bold">클릭당 입찰가{currency ? ` (${currency})` : ""}</label>
      <input id="search-ad-bid" name="cpcBid" type="text" inputMode="decimal" className={field} value={fields.bid} onChange={(event) => update("bid", event.target.value)} maxLength={14} required autoComplete="off" aria-invalid={Boolean(errors.bid)} aria-describedby={describedBy("bid")} />
      {error("bid")}
      <label htmlFor="search-ad-url" className="mt-6 block text-sm font-bold">최종 도착 URL</label>
      <input id="search-ad-url" name="finalUrl" type="url" inputMode="url" className={field} value={fields.finalUrl} onChange={(event) => update("finalUrl", event.target.value)} required autoComplete="off" spellCheck={false} aria-invalid={Boolean(errors.finalUrl)} aria-describedby={describedBy("finalUrl")} />
      {error("finalUrl")}

      {([{ key: "headlines", label: "광고 제목", min: 3, max: 15, width: 30 }, { key: "descriptions", label: "광고 설명", min: 2, max: 4, width: 90 }] as const).map(({ key, label, min, max, width }) => (
        <fieldset key={key} className="mt-7 min-w-0">
          <legend className="text-sm font-bold">{label} <span className="font-normal text-[#657080]">{fields[key].length} / {max}</span></legend>
          <div className="mt-2 space-y-3">
            {fields[key].map((text, index) => {
              const id = `search-ad-${key}-${index}`;
              const used = googleAdWidth(text);
              return <div key={id} className="min-w-0">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <label htmlFor={id} className="flex min-w-0 flex-wrap items-center gap-1">{label} {index + 1}{pins[key]?.[index] && assetIsPinned(pins[key][index]) ? <span className="inline-flex items-center gap-1 break-all text-xs text-[#657080]"><Pin className="size-3 shrink-0" aria-hidden="true" />고정: {pins[key][index].pinnedField}</span> : null}</label>
                  <span id={`${id}-count`} className={`shrink-0 tabular-nums ${used > width ? "text-[#a23428]" : "text-[#657080]"}`}>{used} / {width}</span>
                </div>
                <div className="flex items-start gap-1">
                  {key === "descriptions" ? <textarea id={id} name={id} rows={2} className={`${field} resize-y`} value={text} onChange={(event) => update(key, fields[key].map((value, i) => i === index ? event.target.value : value))} required aria-invalid={Boolean(errors[key]) || used > width} aria-describedby={`${id}-count${errors[key] ? ` search-ad-${key}-error` : ""}`} /> :
                    <input id={id} name={id} className={field} value={text} onChange={(event) => update(key, fields[key].map((value, i) => i === index ? event.target.value : value))} required autoComplete="off" aria-invalid={Boolean(errors[key]) || used > width} aria-describedby={`${id}-count${errors[key] ? ` search-ad-${key}-error` : ""}`} />}
                  {!pinnedSlots ? <button type="button" className={`${iconButton} mt-2`} title={`${label} ${index + 1} 삭제`} aria-label={`${label} ${index + 1} 삭제`} disabled={fields[key].length <= min} onClick={() => update(key, fields[key].filter((_, i) => i !== index))}><Trash2 className="size-4" aria-hidden="true" /></button> : null}
                </div>
              </div>;
            })}
          </div>
          {error(key)}
          {!pinnedSlots ? <button type="button" className={`${iconButton} mt-2`} title={`${label} 추가`} aria-label={`${label} 추가`} disabled={fields[key].length >= max} onClick={() => update(key, [...fields[key], ""])}><Plus className="size-4" aria-hidden="true" /></button> : null}
        </fieldset>
      ))}

      <label htmlFor="search-ad-keywords" className="mt-6 block text-sm font-bold">키워드 (한 줄에 하나)</label>
      <textarea id="search-ad-keywords" name="keywords" rows={6} className={`${field} resize-y`} value={fields.keywords} onChange={(event) => update("keywords", event.target.value)} required aria-invalid={Boolean(errors.keywords)} aria-describedby={`search-ad-keywords-count${errors.keywords ? " search-ad-keywords-error" : ""}`} />
      <p id="search-ad-keywords-count" className="mt-1 text-right text-sm tabular-nums text-[#657080]">{fields.keywords.split(/\r?\n/).filter((line) => line.trim()).length} / 20</p>
      {error("keywords")}
      <label htmlFor="search-ad-match-type" className="mt-5 block text-sm font-bold">키워드 검색 유형</label>
      <select id="search-ad-match-type" name="keywordMatchType" className={field} value={fields.keywordMatchType} onChange={(event) => update("keywordMatchType", event.target.value as SearchAdFields["keywordMatchType"])}>
        <option value="EXACT">일치검색 (EXACT)</option>
        <option value="PHRASE">구문검색 (PHRASE)</option>
        <option value="BROAD">확장검색 (BROAD)</option>
      </select>
    </fieldset>
  );
}
