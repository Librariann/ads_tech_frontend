import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  AuthBackendUnavailableError,
  fetchAuthUser,
  type AuthUser,
} from "@/lib/auth/server";

// The dashboard's getCurrentUser is private; keep its authentication policy without editing that shared page.
export async function getCurrentUser(returnTo: string): Promise<AuthUser> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  const refreshHref = `/api/auth/session?returnTo=${encodeURIComponent(returnTo)}`;
  if (!accessToken) redirect(refreshToken ? refreshHref : "/login");
  try {
    const response = await fetchAuthUser(accessToken);
    if (response.ok) return await response.json() as AuthUser;
    if (response.status === 401) redirect(refreshToken ? refreshHref : "/login?error=session");
    redirect("/login?error=backend");
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) redirect("/login?error=backend");
    throw error;
  }
}
