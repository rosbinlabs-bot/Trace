// Vercel Edge Function backing Phase Management's "AI Insights" panel (src/screens/Phases.tsx +
// src/aiInsights.ts). Runs server-side so the Anthropic API key never reaches the browser -- the
// client already has full access to the project data it POSTs here (loaded via Supabase/RLS same as
// every other screen), this endpoint just adds the one thing the client can't safely hold: the key.
//
// Requires an ANTHROPIC_API_KEY env var set in the Vercel project (Settings -> Environment
// Variables) -- NOT prefixed VITE_, since that would bundle it into the client build. Optional
// ANTHROPIC_MODEL to override the default model id.

export const config = { runtime: 'edge' };

const DEFAULT_MODEL = 'claude-sonnet-5';

function buildPrompt(payload: any): string {
  return `You are a project delivery assistant embedded in Trace PMT, a project management tool. Below is a JSON snapshot of ONE project's phase/milestone/sub task tree and its open risks, taken from the Phase Management screen.

Write a short, specific status brief for the Strategic Lead/Project Manager looking at this exact project right now. Rules:
- 2-4 short sentences (or up to 4 tight bullet points), plain language, no headers, no markdown bold/asterisks.
- Only state things directly supported by the data below -- never invent names, dates or counts that aren't present.
- Prioritize: things overdue, items stuck in review a long time (daysPending), a phase/milestone with no progress despite time elapsed, and open high-impact risks. If everything looks healthy, say so briefly instead of padding with filler.
- Reference milestone/phase names and assignee names from the data when it sharpens the point (e.g. "flag for Jibin" style), but do not fabricate an assignee if none is listed.
- If today's date is close to a deadline with a lot of work still open, say so plainly.
- Do not restate the raw approval-workflow rules (who approves what) -- assume the reader already knows those; focus on THIS project's current state.

Today's date: ${payload.today}

Project data (JSON):
${JSON.stringify(payload, null, 2)}`;
}

export default async function handler(req: Request): Promise<Response> {
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'AI insights aren’t configured yet (missing ANTHROPIC_API_KEY on the server).' }, 500);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (!payload || typeof payload !== 'object' || !payload.project) {
    return json({ error: 'Missing project data' }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: buildPrompt(payload) }],
      }),
    });
  } catch (e: any) {
    return json({ error: `Could not reach the AI service: ${e?.message || e}` }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: `AI service returned an error (${upstream.status})`, detail: detail.slice(0, 500) }, 502);
  }

  const data: any = await upstream.json();
  const text = (data?.content || []).map((b: any) => b?.text || '').join('').trim();
  if (!text) return json({ error: 'AI service returned an empty response' }, 502);

  return json({ insights: text, model: data?.model || null, generatedAt: new Date().toISOString() });
}
