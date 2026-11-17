import {
  DashboardPage,
  type DashboardPageProps,
} from "@/components/dashboard/dashboard-page";

export const metadata = { title: "Google Ads 성과" };

export default function Page(props: DashboardPageProps) {
  return <DashboardPage {...props} view="detail" />;
}
