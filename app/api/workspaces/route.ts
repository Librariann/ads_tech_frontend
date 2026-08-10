import { proxyAuthenticatedJson } from "@/lib/auth/proxy";

export function GET() {
  return proxyAuthenticatedJson("/workspaces");
}
