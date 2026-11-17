import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalDocument,
  type LegalSection,
} from "@/components/public/legal-document";
import { ContactLink } from "@/components/public/site-frame";
import { publicSite } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "데이터 삭제 요청",
  description:
    "GrowdoAds 회원 탈퇴, Google Ads·Meta 연결 권한 철회와 보관 데이터 삭제를 요청하는 방법입니다.",
  alternates: { canonical: `${publicSite.url}/data-deletion` },
};

const sections: LegalSection[] = [
  {
    id: "revoke",
    title: "Google 접근 권한 철회",
    content: (
      <>
        <p>
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google 계정의 서드 파티 연결 관리
          </a>
          에서 GrowdoAds 연결에 사용한 앱을 선택하고 권한을 철회할 수 있습니다.
          동의 화면의 앱 이름은 Google Cloud의 등록 이름에 따라 표시될 수
          있습니다.
        </p>
        <p>
          이 조치는 향후 Google 데이터 접근을 제한하는 절차입니다. GrowdoAds에
          이미 저장된 회원·워크스페이스·연결 기록의 삭제나 Google Ads의 광고
          중지를 대신하지 않습니다.
        </p>
      </>
    ),
  },
  {
    id: "meta-revoke",
    title: "Meta 접근 권한 철회",
    content: (
      <>
        <p>
          Facebook 계정의 비즈니스 통합 설정에서 GrowdoAds 연결에 사용한 앱을
          선택하고 접근 권한을 철회할 수 있습니다. 앱 이름은 Meta에 등록된
          이름으로 표시될 수 있습니다.
        </p>
        <p>
          Meta 권한 철회는 향후 데이터 접근을 제한합니다. GrowdoAds에 저장된
          연결 토큰·광고계정 정보의 삭제는 아래 연락처로 별도 요청해 주세요.
          이 조치가 Meta 광고계정 삭제나 집행 중인 광고 중지를 대신하지는
          않습니다.
        </p>
      </>
    ),
  },
  {
    id: "request",
    title: "삭제·탈퇴 요청 보내기",
    content: (
      <>
        <p>
          현재 삭제·탈퇴는 운영자가 본인과 요청 범위를 확인해 처리합니다. 아래
          공개 연락처로 요청해 주세요.
        </p>
        <p>
          <ContactLink />
        </p>
        <ul>
          <li>
            제목: <strong>[GrowdoAds] 개인정보 삭제 또는 회원 탈퇴 요청</strong>
          </li>
          <li>회원 가입에 사용한 이메일</li>
          <li>관련 워크스페이스 이름 또는 ID</li>
          <li>
            요청 범위: Google·Meta 연결 정보 삭제 / 특정 워크스페이스 정보 / 회원
            탈퇴 등
          </li>
        </ul>
        <p>
          가능하면 가입한 이메일로 연락해 주세요. 타인을 대신해 요청할 경우
          적법한 위임을 확인할 수 있습니다. 비밀번호, 인증코드, OAuth 토큰이나
          신분증 사본을 먼저 보내지 마세요. 필요한 추가 확인은 최소한의 범위로
          별도 안내합니다.
        </p>
      </>
    ),
  },
  {
    id: "processing",
    title: "처리 범위와 결과 안내",
    content: (
      <>
        <ol>
          <li>운영자가 요청자 본인 또는 적법한 권한을 확인합니다.</li>
          <li>
            회원·멤버 정보, 연결 토큰, 광고계정 등록과 생성 요청 기록 등 요청
            대상과 타인의 권리·법적 보존 의무를 확인합니다.
          </li>
          <li>
            삭제 가능한 정보는 지체 없이 처리하고, 보존이 필요한 항목은 그
            사유와 기간을 구분해 안내합니다.
          </li>
          <li>
            처리 결과, 제한 사항 및 백업 관련 처리 범위를 요청한 연락처로
            안내합니다.
          </li>
        </ol>
        <p>
          공유 워크스페이스 전체 삭제는 소유권 확인과 다른 멤버의 권리 검토가
          필요합니다. 단순히 로그인 계정을 비활성화하거나 권한을 철회한 것을
          전체 삭제 완료로 안내하지 않습니다.
        </p>
      </>
    ),
  },
  {
    id: "ads-billing",
    title: "광고·매체 계정·구독은 별도 확인",
    content: (
      <>
        <p>
          <strong>
            데이터 삭제나 탈퇴 요청만으로 Google 등의 광고가 중지되거나 광고비
            청구가 취소되지는 않습니다.
          </strong>{" "}
          집행 중인 캠페인·예산과 결제 내역은 해당 광고 매체에서 확인하고 필요한
          중지·해지 조치를 먼저 진행해 주세요.
        </p>
        <p>
          Google Ads 계정 자체 삭제, MCC 관리 관계 해제, Google 사용자 접근 권한
          변경은 각각 매체의 절차와 관리 권한에 따라 처리됩니다. GrowdoAds의
          서비스 구독 해지도 별도로 요청 범위에 명시해 주세요.
        </p>
        <p>
          보유기간과 처리 기준은 <Link href="/privacy">개인정보처리방침</Link>,
          서비스 이용 조건은 <Link href="/terms">이용약관</Link>에서 확인할 수
          있습니다.
        </p>
      </>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <LegalDocument
      title="데이터 삭제 요청"
      summary="Google·Meta 접근 권한 철회, GrowdoAds에 보관된 정보의 삭제, 광고 중지는 각각 별도의 절차입니다."
      sections={sections}
      related={{ href: "/privacy", label: "개인정보처리방침" }}
    />
  );
}
