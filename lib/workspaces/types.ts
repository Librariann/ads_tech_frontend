export type WorkspaceRole = "owner" | "admin" | "marketer" | "viewer";

export type WorkspaceStatus = "active" | "suspended" | "closed";

export type WorkspaceMemberStatus = "invited" | "active" | "disabled";

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  defaultCurrency: string;
  timezone: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: string;
  userId: string;
  email: string;
  displayName?: string | null;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joinedAt?: string | null;
  createdAt: string;
};

export type WorkspaceInvitation = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  invitedAt: string;
};

export type UpdateWorkspaceInput = {
  name?: string;
  defaultCurrency?: string;
  timezone?: string;
};
