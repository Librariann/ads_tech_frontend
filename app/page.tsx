import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import {
  ContactLink,
  OperatorInfo,
  SiteFrame,
} from "@/components/public/site-frame";
import { publicSite } from "@/lib/public-site";
import styles from "@/components/public/public-site.module.css";

export const metadata: Metadata = {
  title: { absolute: "GrowdoAds | 광고계정 연결과 운영을 더 쉽게" },
  description: publicSite.description,
  alternates: { canonical: publicSite.url },
  openGraph: {
    title: "GrowdoAds",
    description: publicSite.description,
    url: publicSite.url,
    type: "website",
    locale: "ko_KR",
  },
};

const steps = [
  {
    title: "내 비즈니스의 워크스페이스를 만듭니다",
    body: "서비스에 가입하고 함께 일할 멤버를 초대합니다. 워크스페이스별로 멤버와 권한, 연결한 광고계정을 구분합니다.",
  },
  {
    title: "기존 광고계정을 연결하거나, 새 계정을 준비합니다",
    body: "Google 인증으로 접근 가능한 광고계정을 확인하고 직접 선택합니다. 새 광고계정 생성은 운영 MCC와 Google API의 계정 생성 권한이 준비된 경우에 이용할 수 있습니다.",
  },
  {
    title: "계정 권한과 이용 가능한 범위를 확인합니다",
    body: "Google 인증, 광고계정 등록, 광고 집행은 서로 다른 단계입니다. 계정 연결만으로 광고가 게시되거나 광고비가 발생하지 않습니다.",
  },
  {
    title: "우리 서비스에서 광고 운영을 이어갑니다",
    body: "계정 연결을 기반으로 캠페인 운영과 성과 확인까지 이어지는 서비스를 개발하고 있습니다. 현재는 계정 연결·워크스페이스·구독 흐름을 중심으로 테스트하고 있습니다.",
  },
];

export default function PublicHomePage() {
  return (
    <SiteFrame>
      <div className={styles.shell}>
        <section className={styles.intro} aria-labelledby="service-name">
          <p className={styles.eyebrow}>
            <FlaskConical size={15} aria-hidden="true" /> 광고 운영 워크스페이스
            · 개발·테스트 운영
          </p>
          <h1 id="service-name" className={styles.headline}>
            GrowdoAds
          </h1>
          <p className={styles.lead}>
            광고계정 연결부터 운영 준비까지.
            <br />
            복잡한 광고를, 내 비즈니스의 흐름으로.
          </p>
          <p className={styles.description}>
            GrowdoAds는 직접 광고를 운영하는 사업자와 팀을 위한 서비스입니다.
            Google Ads 계정을 워크스페이스에 연결하고, 멤버별 권한과 계정 상태를
            함께 관리할 수 있습니다.
          </p>
          <div className={styles.introLinks}>
            <Link href="/login" className={styles.button}>
              계정 연결 시작하기 <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="#how-it-works" className={styles.textLink}>
              이용 흐름 살펴보기 <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.statusLine} aria-label="광고 매체 지원 상태">
            <span>
              <i className={styles.statusDot} aria-hidden="true" />
              <strong>Google Ads</strong> 연결 개발·테스트
            </span>
            <span>
              <strong>Meta</strong> 연동 준비 중
            </span>
            <span>
              <strong>네이버</strong> 연동 준비 중
            </span>
          </div>
        </section>
      </div>

      <div className={styles.shell}>
        <section
          id="how-it-works"
          className={`${styles.section} ${styles.sectionGrid}`}
          aria-labelledby="flow-title"
        >
          <div>
            <p className={styles.eyebrow}>서비스 이용 흐름</p>
            <h2 id="flow-title" className={styles.sectionTitle}>
              내 계정으로 시작하고,
              <br />내 팀과 관리합니다.
            </h2>
            <p className={styles.sectionLead}>
              광고 매체의 계정과 권한은 유지하면서, 운영에 필요한 연결을 한곳에
              모읍니다.
            </p>
          </div>
          <div>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className={styles.stepNumber}>0{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className={styles.note}>
              Google이 요구하는 권한 동의, 초대 수락, 결제수단 등록 및 신원
              확인은 필요한 경우 Google 화면에서 직접 완료합니다. 새 계정 자동
              생성과 관리자 초대는 Google의 API 승인·계정 자격에 따라 제한될 수
              있습니다.
            </p>
          </div>
        </section>

        <section
          id="data-and-permissions"
          className={`${styles.section} ${styles.sectionGrid}`}
          aria-labelledby="permissions-title"
        >
          <div>
            <p className={styles.eyebrow}>
              <ShieldCheck size={15} aria-hidden="true" /> 데이터와 권한
            </p>
            <h2 id="permissions-title" className={styles.sectionTitle}>
              연결 권한과
              <br />
              광고비는 구분합니다.
            </h2>
            <p className={styles.sectionLead}>
              어떤 정보를 연결하고, 비용은 어디에 지불하는지 먼저 확인하세요.
            </p>
          </div>
          <div>
            <dl className={styles.featureRows}>
              <div>
                <dt>Google 로그인과 광고계정 연결은 별개입니다</dt>
                <dd>
                  서비스 로그인에는 이메일과 계정 식별정보를 사용합니다.
                  광고계정에 접근하려면 별도의 Google Ads 권한 동의가
                  필요합니다. Google 비밀번호나 Google 결제카드 정보를 입력받지
                  않습니다.
                </dd>
              </div>
              <div>
                <dt>Google Ads 데이터는 연결한 기능에만 이용합니다</dt>
                <dd>
                  계정 식별정보, 연결 상태와 권한 토큰 등을 계정 조회·등록·관리
                  기능 제공에 사용합니다. Google 데이터의 판매, 무관한 광고
                  타기팅, 범용 AI 모델 학습에 사용하지 않습니다.
                </dd>
              </div>
              <div>
                <dt>광고비는 광고 매체에 직접 납부합니다</dt>
                <dd>
                  GrowdoAds의 서비스 이용료와 Google 등 매체에 지불하는 광고비는
                  별개입니다. 현재 구독 결제 흐름은 모의 결제 기반 테스트이며
                  실제 결제 청구를 의미하지 않습니다.
                </dd>
              </div>
              <div>
                <dt>권한 철회와 데이터 삭제를 요청할 수 있습니다</dt>
                <dd>
                  Google 계정에서 연결 권한을 철회할 수 있으며, GrowdoAds에
                  보관된 데이터의 삭제·탈퇴는 운영자에게 요청할 수 있습니다.
                  권한 철회나 서비스 탈퇴만으로 매체의 광고가 자동 중지되지는
                  않습니다.
                </dd>
              </div>
            </dl>
            <div className={styles.legalLinks}>
              <Link href="/privacy" className={styles.textLink}>
                개인정보처리방침 <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link href="/data-deletion" className={styles.textLink}>
                권한 철회·삭제 안내 <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section
          id="contact"
          className={`${styles.contactSection} ${styles.sectionGrid}`}
          aria-labelledby="contact-title"
        >
          <div>
            <p className={styles.eyebrow}>운영 및 문의</p>
            <h2 id="contact-title" className={styles.sectionTitle}>
              Growdo가 운영합니다.
            </h2>
          </div>
          <div>
            <OperatorInfo />
            <div className={styles.legalLinks}>
              <ContactLink>서비스·개인정보 문의하기</ContactLink>
              <Link href="/terms" className={styles.textLink}>
                이용약관 <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </SiteFrame>
  );
}
