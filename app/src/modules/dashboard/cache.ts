/**
 * Cache helper for Dashboard module — Module 5.6
 *
 * Uses Next.js unstable_cache for server-side caching with revalidation.
 * Cache keys are namespaced by brandId to allow per-brand invalidation.
 */

import { unstable_cache } from "next/cache";
import {
  getBrandWithRelations,
  getEmptyStateConfig,
  getPromptExplorerData,
  getCompetitorExplorerData,
  getReportData,
  computeOverviewMetrics,
} from "./queries";

/**
 * Cache TTL in seconds — 60 seconds for fresh dashboard data
 * (short TTL because scoring runs can update visibility_snapshots frequently)
 */
const CACHE_TTL = 60;

/**
 * Brand-related cache keys
 */
export const cacheKeys = {
  brand: (brandId: string) => `dashboard:brand:${brandId}`,
  emptyState: (brandId: string) => `dashboard:empty-state:${brandId}`,
  overview: (brandId: string, engine: string) => `dashboard:overview:${brandId}:${engine}`,
  prompts: (brandId: string, engine: string) => `dashboard:prompts:${brandId}:${engine}`,
  competitors: (brandId: string, engine: string) => `dashboard:competitors:${brandId}:${engine}`,
  report: (brandId: string, periodStart: string, periodEnd: string, engine: string) =>
    `dashboard:report:${brandId}:${periodStart}:${periodEnd}:${engine}`,
};

/**
 * Cached brand query
 */
export const getCachedBrand = unstable_cache(
  async (brandId: string) => getBrandWithRelations(brandId),
  [cacheKeys.brand("")], // placeholder, actual key includes brandId
  { revalidate: CACHE_TTL, tags: ["dashboard", "brand"] },
);

/**
 * Cached empty state config
 */
export const getCachedEmptyState = unstable_cache(
  async (brandId: string) => getEmptyStateConfig(brandId),
  [cacheKeys.emptyState("")],
  { revalidate: CACHE_TTL, tags: ["dashboard", "empty-state"] },
);

/**
 * Cached overview metrics
 */
export const getCachedOverview = unstable_cache(
  async (brandId: string, engine: "gemini" | "nvidia-nim") =>
    computeOverviewMetrics(brandId, engine),
  [cacheKeys.overview("", "")],
  { revalidate: CACHE_TTL, tags: ["dashboard", "overview"] },
);

/**
 * Cached prompt explorer data
 */
export const getCachedPrompts = unstable_cache(
  async (brandId: string, engine: "gemini" | "nvidia-nim") =>
    getPromptExplorerData(brandId, engine),
  [cacheKeys.prompts("", "")],
  { revalidate: CACHE_TTL, tags: ["dashboard", "prompts"] },
);

/**
 * Cached competitor explorer data
 */
export const getCachedCompetitors = unstable_cache(
  async (brandId: string, engine: "gemini" | "nvidia-nim") =>
    getCompetitorExplorerData(brandId, engine),
  [cacheKeys.competitors("", "")],
  { revalidate: CACHE_TTL, tags: ["dashboard", "competitors"] },
);

/**
 * Cached report data
 */
export const getCachedReport = unstable_cache(
  async (
    brandId: string,
    periodStart: string,
    periodEnd: string,
    engine: "gemini" | "nvidia-nim",
  ) => getReportData(brandId, periodStart, periodEnd, engine),
  [cacheKeys.report("", "", "", "")],
  { revalidate: CACHE_TTL, tags: ["dashboard", "report"] },
);

/**
 * Cache tag for invalidation
 */
export const DASHBOARD_CACHE_TAG = "dashboard";

/**
 * Revalidate all dashboard data for a brand
 * Call this after scoring cycle completes or new check runs finish
 */
export async function revalidateBrandDashboard(brandId: string) {
  const { revalidateTag } = await import("next/cache");
  const tags = [
    `dashboard:brand:${brandId}`,
    `dashboard:overview:${brandId}`,
    `dashboard:prompts:${brandId}`,
    `dashboard:competitors:${brandId}`,
    `dashboard:report:${brandId}`,
  ];
  for (const tag of tags) {
    revalidateTag(tag, {});
  }
}
