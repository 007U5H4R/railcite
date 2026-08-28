import { z } from 'zod';
import manifest from '@/ingest/local-manifest.json';
const Entry = z.object({
  file: z.string().endsWith('.pdf'),
  title: z.string().min(4),
  doc_type: z.enum(['manual','circular','correction_slip','tariff']),
  domain: z.enum(['goods','coaching']).nullable(),
  commodity: z.string().nullable(),
});
it('local manifest is well-formed', () => { z.array(Entry).min(4).parse(manifest); });
