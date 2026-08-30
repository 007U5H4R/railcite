import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth';
import { translate } from '@/lib/translate';
import { parseNote } from '@/lib/note';
import type { ConclusionBlock, Translation } from '@/lib/types';

export const maxDuration = 60;

// Translate an already-validated English answer into Hindi. Deliberately DOES NOT re-run
// retrieval or synthesis or validation — it only translates prose the client already holds, so
// the trust core (cite-or-refuse, P0 fabrication check) is never re-entered. Citations are not
// part of the request or response: the client keeps the English citation numbers and only swaps
// display text, so a translation can never fabricate or move a citation.
const BlockSchema = z.object({ text: z.string(), citations: z.array(z.number().int()) });
const Body = z.object({
  blocks: z.array(BlockSchema),
  note: z.array(BlockSchema),
  target: z.literal('hi'),   // only Hindi for now; widen when more languages are added
});

export async function POST(req: Request): Promise<Response> {
  const json = (b: unknown, status = 200) => Response.json(b, { status });
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'invalid body' }, 400);
    if (!await getUserFromRequest(req)) return json({ error: 'auth_required' }, 401);
    const { blocks, note } = parsed.data;

    // Only prose that actually renders is worth translating: cited conclusion blocks, the note
    // subject value, and cited note points (index-aligned to DraftedNote's parseNote).
    const cited = blocks.map((b, i) => ({ b, i })).filter(x => x.b.citations.length > 0);
    const { sub, contentBlocks } = parseNote(note as ConclusionBlock[], []);

    const batch = [
      ...cited.map(x => x.b.text),
      ...(sub ? [sub] : []),
      ...contentBlocks.map(b => b.text),
    ];
    const hi = await translate(batch);   // throws on count mismatch — never misaligns

    let k = 0;
    const hiCited = cited.map(() => hi[k++]);
    const noteSub = sub ? hi[k++] : null;
    const noteContent = contentBlocks.map(() => hi[k++]);

    // Scatter cited-block translations back to raw-block positions; uncited slots stay '' (they
    // never render, so they need no translation).
    const hiBlocks = blocks.map(() => '');
    cited.forEach((x, j) => { hiBlocks[x.i] = hiCited[j]; });

    return json({ blocks: hiBlocks, noteSub, noteContent } satisfies Translation);
  } catch (e) {
    console.error('translate failed:', e);
    return json({ error: 'translate_failed' }, 500);
  }
}
