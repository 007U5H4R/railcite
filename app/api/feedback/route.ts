import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth';
import { bearerToken, userClient } from '@/lib/supabase-user';

// Product feedback from the "Feedback" tab (migrations/003_feedback.sql). Same posture as
// /api/cases: this is USER data, so the insert runs through `userClient(token)` (anon key +
// the caller's own access token) and Postgres RLS (feedback_insert_own) enforces
// auth.uid() = user_id — app code never trusts a client-supplied user_id.

const json = (b: unknown, status = 200) => Response.json(b, { status });

const FeedbackBody = z.object({
  message: z.string().trim().min(1).max(4000),
}).strict();

export async function POST(req: Request): Promise<Response> {
  try {
    const token = bearerToken(req);
    const user = token ? await getUserFromRequest(req) : null;
    if (!token || !user) return json({ error: 'auth_required' }, 401);

    const parsed = FeedbackBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'invalid_body' }, 400);

    const sb = userClient(token);
    const { error } = await sb.from('feedback').insert({ user_id: user.id, message: parsed.data.message });
    if (error) { console.error('feedback insert failed:', error); return json({ error: 'save_failed' }, 500); }
    return json({ ok: true }, 201);
  } catch (e) {
    console.error('feedback POST failed:', e);
    return json({ error: 'save_failed' }, 500);
  }
}
