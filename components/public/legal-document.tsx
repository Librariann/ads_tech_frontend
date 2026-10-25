import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { publicSite } from "@/lib/public-site";
import { SiteFrame } from "./site-frame";
import styles from "./public-site.module.css";

export type LegalSection = { id: string; title: string; content: ReactNode };

export function DataList({
  rows,
}: {
  rows: { label: string; content: ReactNode }[];
}) {
  return (
    <dl className={styles.dataList}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.content}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LegalDocument({
  title,
  summary,
  sections,
  related,
}: {
  title: string;
  summary: string;
  sections: LegalSection[];
  related: { href: string; label: string };
}) {
  return (
    <SiteFrame>
      <div className={styles.shell}>
        <header className={styles.legalHeader}>
          <p className={styles.eyebrow}>GrowdoAds · 서비스 정책</p>
          <h1 className={styles.legalTitle}>{title}</h1>
          <p className={styles.legalSummary}>{summary}</p>
          <div className={styles.legalMeta}>
            <span>버전 1.0</span>
            <span>시행일 {publicSite.effectiveDate}</span>
            <span>운영자 {publicSite.operator}</span>
          </div>
        </header>
        <div className={styles.legalLayout}>
          <nav className={styles.toc} aria-label={`${title} 목차`}>
            <p>이 문서의 내용</p>
            <ol>
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>
                    {i + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className={styles.legalBody}>
            {sections.map((section, i) => (
              <section id={section.id} key={section.id}>
                <h2>
                  {i + 1}. {section.title}
                </h2>
                {section.content}
              </section>
            ))}
            <div className={styles.legalBottom}>
              <Link href="/">
                <ArrowLeft size={14} aria-hidden="true" />
                서비스 소개
              </Link>
              <Link href={related.href}>
                {related.label}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </div>
      </div>
    </SiteFrame>
  );
}
