import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Mail } from "lucide-react";
import type { ReactNode } from "react";
import { publicSite } from "@/lib/public-site";
import styles from "./public-site.module.css";

export function PolicyLinks() {
  return (
    <nav aria-label="서비스 정책" className={styles.policyLinks}>
      <Link href="/">서비스 소개</Link>
      <Link href="/privacy">개인정보처리방침</Link>
      <Link href="/terms">이용약관</Link>
      <Link href="/data-deletion">데이터 삭제 요청</Link>
    </nav>
  );
}

export function ContactLink({ children }: { children?: ReactNode }) {
  return publicSite.email ? (
    <a className={styles.contactLink} href={`mailto:${publicSite.email}`}>
      <Mail size={16} aria-hidden="true" />
      {children || publicSite.email}
    </a>
  ) : (
    <span>공개 문의 이메일 확인 중</span>
  );
}

export function OperatorInfo() {
  return (
    <dl className={styles.operatorInfo}>
      <div>
        <dt>운영자</dt>
        <dd>{publicSite.operator}</dd>
      </div>
      <div>
        <dt>상호</dt>
        <dd>{publicSite.businessName}</dd>
      </div>
      {publicSite.representative ? (
        <div>
          <dt>대표자</dt>
          <dd>{publicSite.representative}</dd>
        </div>
      ) : null}
      {publicSite.businessNumber ? (
        <div>
          <dt>사업자등록번호</dt>
          <dd>{publicSite.businessNumber}</dd>
        </div>
      ) : null}
      {publicSite.commerceNumber ? (
        <div>
          <dt>통신판매업 신고번호</dt>
          <dd>{publicSite.commerceNumber}</dd>
        </div>
      ) : null}
      {publicSite.address ? (
        <div>
          <dt>사업장 주소</dt>
          <dd>{publicSite.address}</dd>
        </div>
      ) : null}
      {publicSite.phone ? (
        <div>
          <dt>전화</dt>
          <dd>{publicSite.phone}</dd>
        </div>
      ) : null}
      <div>
        <dt>서비스·개인정보 문의</dt>
        <dd>
          <ContactLink />
        </dd>
      </div>
    </dl>
  );
}

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.site}>
      <a href="#main-content" className={styles.skipLink}>
        본문으로 바로가기
      </a>
      <header className={`${styles.shell} ${styles.header}`}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="GrowdoAds 서비스 소개"
        >
          <Image
            src="/growdoads-kakao-icon.png"
            alt=""
            width={34}
            height={34}
          />
          <span>GrowdoAds</span>
        </Link>
        <nav className={styles.headerNav} aria-label="공개 페이지 메뉴">
          <Link href="/#how-it-works">이용 흐름</Link>
          <Link href="/#data-and-permissions">데이터와 권한</Link>
          <Link href="/#contact">문의</Link>
        </nav>
        <Link href="/login" className={styles.headerLogin}>
          로그인 <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <main id="main-content" className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={styles.shell}>
          <div className={styles.footerTop}>
            <Link href="/" className={styles.footerBrand}>
              GrowdoAds
            </Link>
            <PolicyLinks />
          </div>
          <OperatorInfo />
          <div className={styles.footerBottom}>
            <p>
              광고비는 각 광고 매체에 직접 납부하며, 서비스 구독료와 별개입니다.
            </p>
            <p>Google, Meta, 네이버와 독립적으로 운영되는 서비스입니다.</p>
          </div>
          <a
            className={styles.externalLink}
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API 사용자 데이터 정책{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
