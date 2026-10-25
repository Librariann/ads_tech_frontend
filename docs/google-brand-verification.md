# Google 브랜드 인증 준비

## 공개 URL

- 홈페이지: `https://ads-tech-frontend.vercel.app/`
- 개인정보처리방침: `https://ads-tech-frontend.vercel.app/privacy`
- 이용약관: `https://ads-tech-frontend.vercel.app/terms`
- 삭제 요청 안내: `https://ads-tech-frontend.vercel.app/data-deletion`

이 URL은 프론트 소스를 Vercel에 배포한 뒤에만 새 페이지를 제공한다. 로컬 구현 완료가 운영 배포나 Google 인증 완료를 뜻하지 않는다. 홈페이지는 모든 방문자에게 공개되며, 기존 로그인 후 대시보드는 `/dashboard`로 이동했다. 개인정보처리방침 링크는 로그인 없이 접근 가능하고 홈페이지·로그인·대시보드에서 연결된다.

## 운영자 확인

사용자가 제공한 운영자명은 `Growdo`, 상호는 `Growdo (그로우두)`이며, 기존 Google 설정의 이메일을 연락처로 사용한다. 공개 이메일의 정확한 표기와 사용 승낙을 최종 확인한다. 아래 정보는 추측하거나 가짜 값으로 채우지 않는다.

- 사업자등록증상 대표자, 주소, 사업자등록번호, 공개 전화, 해당 시 통신판매업 신고번호
- 개인정보 처리 담당자와 문의 대응 책임, 요청 접수·본인 확인·삭제 처리 절차
- 실제 Vercel/Railway 계약 주체·수탁 범위, DB/Redis/백업/로그의 배치와 보유기간
- 국외 이전이 있다면 이전받는 자·연락처·국가·항목·시기·방법·목적·보유기간·법적 근거·거부 방법/영향
- 실제 구독 판매 전 계약·갱신·해지·법정 청약철회·환불 조건, PG와 결제 정보 범위

`.env.example`의 `SITE_*` 설정을 참고한다. `SITE_HOSTING_REGIONS`에는 실제 이전 내역을, `SITE_LOG_RETENTION`에는 실제 로그·문의·백업 보유 및 파기 기준을 입력한다. 단순한 국가명이나 불확실한 기간으로 대체하지 않는다. 설정은 정적 페이지 빌드에 반영되므로 변경 후 재배포한다.

공개 페이지는 서비스와 정책을 설명하지만 법률 검토나 Google 승인을 보장하지 않는다. 세부 사업자 정보는 사용자가 추후 보완하기로 했으며, 수탁·국외 이전의 구체적인 내용과 실제 보유·파기 기준도 정식 운영 전 확정해 본문에 반영해야 한다. 누락된 사실을 임의로 채우지 않는다.

## 현재 구현과 정책의 구분

- Google Ads 연결 토큰은 암호화 저장하며, Google 비밀번호·실제 결제카드 정보를 받지 않는다.
- 현재 결제는 pay-rehearsal을 통한 모의 결제다. 실제 유료 정기결제·환불 API가 있다고 주장하지 않는다.
- 계정 생성·초대는 Google 승인/자격에 제한된다. 현재 Explorer 프로젝트의 createCustomerClient는 테스트 MCC에 대해서도 403으로 차단된 것을 확인했다.
- Google OAuth 권한 철회와 서비스 저장 데이터 삭제는 별개다. 현재 자동 탈퇴·데이터 삭제 UI/완료 API는 없으므로 공개 메일 접수 후 운영자가 처리한다.
- 삭제 요청을 받으면 단순 soft-delete나 세션 무효화로 완료 처리하지 않는다. 토큰, 회원/OAuth, 멤버, 생성 요청 이력, 공유 Workspace의 권리, 청구/감사 기록과 백업까지 범위를 검토하고 최소한의 법적 보존 대상만 구분한다. 처리 결과와 불가 사유를 회신한다.
- 법적 보존기간·로그/백업 주기를 본문에 적는 것만으로 서버 삭제 작업이 구현되는 것은 아니다. 운영 절차와 저장소 설정을 일치시킨다.
- 공개 정책 링크를 추가했지만 이용약관 동의 버전/시각을 기록하는 가입 동의 시스템을 새로 구현한 것은 아니다. 정식 유료 가입 전에 동의 수집·기록을 별도로 마련한다.
- 캠페인 집행/성과 분석, Meta·네이버 광고 연동은 현재 제공 완료로 표시하지 않는다.

## Google 신청 순서

1. 홈페이지에서 서비스명·실제 기능·문의·정책 링크를 확인한다. 홈을 로그인으로만 리디렉션하지 않는다.
2. 브랜드 이름, 홈페이지, 개인정보처리방침, 이용약관을 Google 인증 플랫폼 브랜딩에 등록한다.
3. 프로젝트 Owner/Editor 계정으로 승인된 도메인의 소유권을 Search Console에서 증명한다. Vercel/Railway 공유 도메인 사용 시 검증 가능 여부를 확인하고, 불가능하면 직접 관리하는 도메인을 연결한다. 콜백 도메인 변경 시 OAuth 허용 URI와 백엔드 설정도 함께 맞춘다.
4. API Basic 신청용으로는 Audience를 External / In production으로 설정한다. 게시만으로 브랜드 인증이 완료되는 것은 아니다.
5. 브랜딩 인증을 요청하고 검증된 브랜딩을 게시한다. 필요한 경우 별도 데이터 접근(scope) 심사를 진행한다.
6. Google Ads API Overview에서 Basic을 다시 신청한다. 승인은 Google이 판단하며 사이트 제작만으로 보장하지 않는다.

## 검증

실행 중인 프론트에 대해 `PUBLIC_SITE_TEST_URL=http://localhost:3000 node --test test/public-pages.test.mjs`를 실행한다. 외부 서비스 인증 없이 `/`, `/privacy`, `/terms`, `/data-deletion`이 200으로 열리고, 로그인/비정상 쿠키와 무관하게 공개 콘텐츠가 제공되어야 한다. 이 검증은 배포 서버에서도 URL을 바꾸어 수행할 수 있다.

## 근거

- [Google 브랜드 인증 요구사항](https://support.google.com/cloud/answer/13464321?hl=en)
- [Google Ads Basic용 브랜드 인증](https://developers.google.com/google-ads/api/docs/api-policy/brand-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [개인정보 보호법 제30조](https://www.law.go.kr/법령/개인정보보호법/제30조)
- [전자상거래법 제10조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1022342373)
