// Client-side plumbing for Phase Management's AI Insights panel (src/screens/Phases.tsx).
// The actual model call happens server-side in api/insights.ts -- this file just builds the
// request, caches the result per project for the rest of the browser session (sessionStorage, so a
// tab switch or refresh doesn't silently re-bill/re-call the API), and gives the panel a small
// state machine to render.
import { buildProjectInsightPayload } from './shared';

export type InsightsResult = { insights: string; generatedAt: string; model?: string | null };

const CACHE_PREFIX = 'tracepmt_ai_insights_';

export const readCachedInsights = (projectId: string): InsightsResult | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + projectId);
    return raw ? (JSON.parse(raw) as InsightsResult) : null;
  } catch {
    return null;
  }
};

const writeCachedInsights = (projectId: string, result: InsightsResult) => {
  try { sessionStorage.setItem(CACHE_PREFIX + projectId, JSON.stringify(result)); } catch { /* best effort */ }
};

export const generateProjectInsights = async (
  projectId: string, projMeta: any, phases: any[], risks: any[]
): Promise<InsightsResult> => {
  const payload = buildProjectInsightPayload(projMeta, phases, risks);
  const res = await fetch('/api/insights', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  const result: InsightsResult = { insights: body.insights, generatedAt: body.generatedAt, model: body.model };
  writeCachedInsights(projectId, result);
  return result;
};

// "updated 3m ago" / "updated 2h ago" style relative label for the panel header.
export const formatTimeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};
