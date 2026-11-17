import {
  DashboardPage,
  type DashboardPageProps,
} from "@/components/dashboard/dashboard-page";

export const metadata = { title: "홈" };

export default function Page(props: DashboardPageProps) {
  return <DashboardPage {...props} view="overview" />;
}
