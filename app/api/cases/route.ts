import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth';
import { bearerToken, userClient } from '@/lib/supabase-user';

// R4 data layer: persist + list + toggle-save the caller's own cases (migrations/002_cases.sql).
// Ownership is enforced by Postgres RLS, not app code — every query below runs through
// `userClient(token)` (anon key + the caller's own access token), so `auth.uid() = user_id`
// is what actually gates every select/insert/update. App code never trusts a client-supplied
// user_id; the only source of truth for "who is this" is the verified token via
// `getUserFromRequest` (lib/auth.ts, unchanged).

const json = (b: unknown, status = 200) => Response.json(b, { status });

const CASE_COLUMNS = 'id, question, status, verified_only, domain, is_saved, created_at';

const SaveBody = z.object({
  question: z.string().trim().min(1).max(4000),
  verified_only: z.boolean().optional().default(false),
  domain: z.string().max(64).nullable().optional(),
  status: z.enum(['answered', 'refused']),
  // Full QueryResponse for either status (see 002_cases.sql) — shape isn't re-validated
  // field-by-field here (that already happened when /api/query produced it); this just
  // guards that it's a plain JSON object, not e.g. an array or primitive.
  result: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

const PatchBody = z.object({
  id: z.string().uuid(),
  is_saved: z.boolean(),
}).strict();

/** Verifies the caller and returns their uid + raw token, or null (→ 401). */
async function authenticate(req: Request): Promise<{ uid: string; token: string } | null> {
  const token = bearerToken(req);
  const user = token ? await getUserFromRequest(req) : null;
  if (!token || !user) return null;
  return { uid: user.id, token };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const auth = await authenticate(req);
    if (!auth) return json({ error: 'auth_required' }, 401);
    const parsed = SaveBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'invalid_body' }, 400);
    const { question, verified_only, domain, status, result } = parsed.data;

    const sb = userClient(auth.token);
    const { data, error } = await sb.from('cases')
      .insert({ user_id: auth.uid, question, verified_only, domain: domain ?? null, status, result: result ?? null })
      .select('id, created_at')
      .single();
    if (error || !data) { console.error('case insert failed:', error); return json({ error: 'save_failed' }, 500); }
    return json({ id: data.id, created_at: data.created_at }, 201);
  } catch (e) {
    console.error('cases POST failed:', e);
    return json({ error: 'save_failed' }, 500);
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await authenticate(req);
    if (!auth) return json({ error: 'auth_required' }, 401);
    const sb = userClient(auth.token);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (id) {
      if (!z.string().uuid().safeParse(id).success) return json({ error: 'invalid_id' }, 400);
      // No .eq('user_id', uid) needed/added — RLS (cases_select_own) already scopes this to
      // the caller; a well-formed id belonging to someone else simply returns no row (404),
      // which also avoids leaking whether the id exists at all.
      const { data, error } = await sb.from('cases').select(`${CASE_COLUMNS}, result`).eq('id', id).maybeSingle();
      if (error) { console.error('case fetch failed:', error); return json({ error: 'fetch_failed' }, 500); }
      if (!data) return json({ error: 'not_found' }, 404);
      return json({ case: data });
    }

    const saved = url.searchParams.get('saved') === '1';
    let list = sb.from('cases').select(CASE_COLUMNS).order('created_at', { ascending: false }).limit(200);
    if (saved) list = list.eq('is_saved', true);
    const { data, error } = await list;
    if (error) { console.error('cases list failed:', error); return json({ error: 'fetch_failed' }, 500); }
    return json({ cases: data ?? [] });
  } catch (e) {
    console.error('cases GET failed:', e);
    return json({ error: 'fetch_failed' }, 500);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const auth = await authenticate(req);
    if (!auth) return json({ error: 'auth_required' }, 401);
    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'invalid_body' }, 400);
    const { id, is_saved } = parsed.data;

    const sb = userClient(auth.token);
    // RLS (cases_update_own) scopes this to the caller's own row; if `id` belongs to
    // someone else (or doesn't exist) the update matches 0 rows → data is null → 404.
    const { data, error } = await sb.from('cases').update({ is_saved }).eq('id', id)
      .select('id, is_saved').maybeSingle();
    if (error) { console.error('case update failed:', error); return json({ error: 'update_failed' }, 500); }
    if (!data) return json({ error: 'not_found' }, 404);
    return json(data);
  } catch (e) {
    console.error('cases PATCH failed:', e);
    return json({ error: 'update_failed' }, 500);
  }
}
