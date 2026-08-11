import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  ACCESS_TOKEN_COOKIE,
  AuthBackendUnavailableError,
  REFRESH_TOKEN_COOKIE,
  authBackendFetch,
} from "@/lib/auth/server";
import type {
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@/lib/workspaces/types";

export function getWorkspaces(returnTo = "/workspaces") {
  return fetchWorkspaceJson<Workspace[]>("/workspaces", returnTo);
}

export function getWorkspaceInvitations(returnTo = "/invitations") {
  return fetchWorkspaceJson<WorkspaceInvitation[]>(
    "/workspaces/invitations",
    returnTo,
  );
}

export async function getWorkspace(workspaceId: string, returnTo: string) {
  const response = await fetchWorkspaceResponse(
    `/workspaces/${encodeURIComponent(workspaceId)}`,
    returnTo,
  );

  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error("워크스페이스 정보를 불러오지 못했습니다.");
  }

  return (await response.json()) as Workspace;
}

export async function getWorkspaceMembers(
  workspaceId: string,
  returnTo: string,
) {
  const response = await fetchWorkspaceResponse(
    `/workspaces/${encodeURIComponent(workspaceId)}/members`,
    returnTo,
  );

  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error("멤버 정보를 불러오지 못했습니다.");
  }

  return (await response.json()) as WorkspaceMember[];
}

async function fetchWorkspaceJson<T>(path: string, returnTo: string) {
  const response = await fetchWorkspaceResponse(path, returnTo);
  if (!response.ok) {
    throw new Error("워크스페이스 정보를 불러오지 못했습니다.");
  }
  return (await response.json()) as T;
}

async function fetchWorkspaceResponse(path: string, returnTo: string) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    redirect(
      refreshToken
        ? `/api/auth/session?returnTo=${encodeURIComponent(returnTo)}`
        : "/login",
    );
  }

  try {
    const response = await authBackendFetch(path, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401) {
      redirect(
        refreshToken
          ? `/api/auth/session?returnTo=${encodeURIComponent(returnTo)}`
          : "/login?error=session",
      );
    }

    return response;
  } catch (error) {
    if (error instanceof AuthBackendUnavailableError) {
      redirect("/login?error=backend");
    }
    throw error;
  }
}
