import type { MetadataRoute } from "next";
import { publicSite } from "@/lib/public-site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/data-deletion"],
      disallow: [
        "/dashboard",
        "/admin",
        "/api/",
        "/workspaces",
        "/invitations",
        "/advertising",
        "/login",
      ],
    },
    sitemap: `${publicSite.url}/sitemap.xml`,
  };
}
