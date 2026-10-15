export type AdminSubscription = {
  id: string;
  planCode: string;
  planName: string;
  provider: string;
  status: string;
  currentPeriodEnd: string;
};

export type AdminWorkspace = {
  id: string;
  name: string;
  status: string;
  role: string;
  subscription: AdminSubscription | null;
};

export type AdminUser = {
  id: string;
  email: string;
  displayName?: string | null;
  status: string;
  isPlatformAdmin: boolean;
  createdAt: string;
  workspaces: AdminWorkspace[];
};

export type AdminUsersPage = {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
};

export type AdminPlan = {
  code: string;
  name: string;
  billingInterval: string;
  priceAmount: number;
  currency: string;
};
