import type { MetadataRoute } from "next";
import { publicPaths, publicSite } from "@/lib/public-site";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({
    url: `${publicSite.url}${path === "/" ? "" : path}`,
    lastModified: publicSite.effectiveDate,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
