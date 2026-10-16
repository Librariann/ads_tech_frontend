import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  ACCESS_TOKEN_COOKIE,
  AuthBackendUnavailableError,
  REFRESH_TOKEN_COOKIE,
  authBackendFetch,
  fetchAuthUser,
  type AuthUser,
} from "@/lib/auth/server";
import type { AdminPlan, AdminUsersPage } from "@/lib/admin/types";

export async function getAdminData(query: string, page: number) {
  const cookiesStore = await cookies();
  const accessToken = cookiesStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookiesStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    redirect(refreshToken ? "/api/auth/session?returnTo=/admin" : "/login");
  }

  try {
    const meResponse = await fetchAuthUser(accessToken);
    if (meResponse.status === 401) {
      redirect(refreshToken ? "/api/auth/session?returnTo=/admin" : "/login");
    }
    if (!meResponse.ok) throw new Error("관리자 정보를 불러오지 못했습니다.");
    const me = (await meResponse.json()) as AuthUser;
    if (!me.isPlatformAdmin) notFound();

    const headers = { Authorization: `Bearer ${accessToken}` };
    const search = new URLSearchParams({
      query,
      page: String(page),
      limit: "20",
    });
    const [usersResponse, plansResponse] = await Promise.all([
      authBackendFetch(`/admin/users?${search}`, { headers }),
      authBackendFetch("/admin/plans", { headers }),
    ]);
    if (!usersResponse.ok || !plansResponse.ok) {
      throw new Error("관리자 데이터를 불러오지 못했습니다.");
    }
    return {
      me,
      users: (await usersResponse.json()) as AdminUsersPage,
      plans: (await plansResponse.json()) as AdminPlan[],
    };
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) {
      throw new Error("인증 서버에 연결할 수 없습니다.");
    }
    throw error;
  }
}
