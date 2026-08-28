import { corpusStats } from '@/lib/retrieval';
export async function GET(): Promise<Response> {
  try { return Response.json(await corpusStats()); }
  catch { return Response.json({ documents: 0, chunks: 0 }); }
}
