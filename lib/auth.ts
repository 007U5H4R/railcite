import { adminClient } from './db';
export async function getUserFromRequest(req: Request): Promise<{ id: string } | null> {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const { data, error } = await adminClient().auth.getUser(h.slice(7));
  return error || !data.user ? null : { id: data.user.id };
}
