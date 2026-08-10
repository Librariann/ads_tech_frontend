import { notFound } from "next/navigation";

import { WorkspaceSettings } from "@/components/workspaces/workspace-settings";
import {
  getWorkspace,
  getWorkspaceMembers,
} from "@/lib/workspaces/server";

export const metadata = {
  title: "워크스페이스 설정",
};

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  if (!/^[1-9]\d*$/.test(workspaceId)) {
    notFound();
  }

  const returnTo = `/workspaces/${workspaceId}/settings`;
  const workspace = await getWorkspace(workspaceId, returnTo);
  const canManageMembers =
    workspace.role === "owner" || workspace.role === "admin";
  const members = canManageMembers
    ? await getWorkspaceMembers(workspaceId, returnTo)
    : null;

  return <WorkspaceSettings workspace={workspace} members={members} />;
}
