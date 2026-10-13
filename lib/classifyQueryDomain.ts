import Anthropic from '@anthropic-ai/sdk';
import { callTool, type ToolSpec } from './llm';

// Query-time domain auto-detection (the "Auto" scope). match_chunks enforces documents.domain
// as a HARD SQL filter, but that only helps if a domain is chosen. Users ask coaching questions
// ("Vikalp scheme") under the all-domains default and get weak, cross-domain goods circulars
// (FM-01 at ~0.37 similarity clearing the 0.32 floor) mixed into the sources.
//
// This reads the QUESTION and infers which body of rules governs it, so the scope is applied
// without the user having to pick. It is deliberately FAIL-OPEN: any uncertainty, any error, any
// malformed model reply resolves to `null` (= the all-domains behaviour that shipped before).
// Auto-detect can only ever NARROW confidently or leave things exactly as they were — never
// mis-scope on a guess. The explicit Goods / Coaching / Commercial-Domain pills remain the
// user's override when they want to force a scope.

export type QueryDomain = 'goods' | 'coaching';

const SYSTEM = `You route an Indian Railways "Traffic Commercial" research question to the body of
rules that governs it. Answer with the set_domain tool.

- "goods": freight and goods traffic — wagons, rakes, demurrage, wharfage, freight rates, GTKM,
  commodity classification, sidings, parcels-by-goods, weighment, punitive charges, CRT/hub-and-spoke.
- "coaching": passenger and coaching traffic — reservation, ticketing, refunds, waitlists, Tatkal,
  the VIKALP / Alternate Train Accommodation Scheme (ATAS), concessions, luggage, season tickets.
- "unclear": it fits neither cleanly, or could genuinely be either. When in doubt, choose "unclear".

Choose "unclear" unless the question clearly belongs to one domain.`;

const TOOL: ToolSpec = {
  name: 'set_domain',
  description: 'Record which domain of railway commercial rules governs the question.',
  input_schema: {
    type: 'object',
    properties: { domain: { type: 'string', enum: ['goods', 'coaching', 'unclear'] } },
    required: ['domain'],
  },
};

/** Pure: map a set_domain tool input (or anything malformed) to a real scope or null (fail-open). */
export function resolveQueryDomain(toolInput: unknown): QueryDomain | null {
  const d = (toolInput as { domain?: unknown } | null)?.domain;
  return d === 'goods' || d === 'coaching' ? d : null;
}

/**
 * Infer the governing domain from the question text, or null when unclear/unavailable.
 * `client` is injectable for tests; production constructs its own. Never throws.
 */
export async function classifyQueryDomain(query: string, client?: Anthropic): Promise<QueryDomain | null> {
  try {
    const { input } = await callTool({ tier: 'fast', system: SYSTEM, tool: TOOL, user: query,
      // Cheapest capable model — this runs on every "Auto" query, concurrently with the
      // embedding call, so its latency is hidden behind retrieval prep.
      maxTokens: 64, anthropic: client });
    return resolveQueryDomain(input);
  } catch (e) {
    // Fail-open: classification is an optimisation, never a gate. A coaching query that fails to
    // classify simply searches all domains, exactly as it did before this feature existed.
    console.warn('query domain classification failed (fail-open to all domains):', e);
    return null;
  }
}
