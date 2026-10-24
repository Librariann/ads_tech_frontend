import { getAdminData } from "@/lib/admin/server";
import { AdminConsole } from "@/components/admin/admin-console";

export const metadata = { title: "운영 관리" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = (params.query ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const data = await getAdminData(query, page);
  return <AdminConsole {...data} query={query} />;
}
