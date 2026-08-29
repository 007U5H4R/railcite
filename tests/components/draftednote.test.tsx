// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DraftedNote, buildNoteText } from '@/components/DraftedNote';
import type { ConclusionBlock, SourceView } from '@/lib/types';

const S1: SourceView = { n: 1, chunk_id: 'c1', snippet: 'Free time for unloading shall be…',
  page_ref: 'p. 178–179', section_ref: 'Para 2511', similarity: 0.9,
  document: { id: 'd1', title: 'IRCM Vol. II', doc_type: 'manual', circular_no: null,
    issue_date: '2019-03-12', is_ocr: false, source_url: null, domain: 'goods', commodity: null } };
const S2: SourceView = { n: 2, chunk_id: 'c2', snippet: 'Where the pilot-to-pilot system…',
  page_ref: 'p. 177–178', section_ref: null, similarity: 0.85,
  document: { id: 'd2', title: 'IRCM Vol. II', doc_type: 'circular', circular_no: 'TCR/1078/2019',
    issue_date: '2019-03-12', is_ocr: false, source_url: null, domain: 'goods', commodity: null } };

// The backend (lib/synthesize.ts's SYSTEM_PROMPT) drafts "Sub:"/"Ref:" opener lines and a
// "Submitted for consideration." closer inside the SAME `note` array as the numbered points —
// lib/validate.ts's STRUCTURAL regex lets them through with zero citations. Fixture mirrors
// that shape so the tests exercise the real contract, not an idealized one.
const SUB_TEXT = 'Levy of demurrage on wagons detained beyond free time.';
const POINT_1 = 'Per para 2511(a), free time is calculated as per the rules in force.';
const POINT_2 = 'Where the pilot-to-pilot system is in force, demurrage follows the approved schedule.';
const NOTE: ConclusionBlock[] = [
  { text: `Sub: ${SUB_TEXT}`, citations: [] },
  { text: 'Ref: IRCM Vol. II (Goods), Paras 2511, 2507–2509.', citations: [] },
  { text: POINT_1, citations: [1] },
  { text: POINT_2, citations: [2] },
  { text: 'Submitted for consideration.', citations: [] },
];

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

it('builds its own Ref: line from SourceView data, keeps the model Sub: line, and lists only the cited points', () => {
  render(<DraftedNote note={NOTE} sources={[S1, S2]} onCite={() => {}} />);
  expect(screen.getByText(SUB_TEXT)).toBeInTheDocument();
  expect(screen.getByText('IRCM Vol. II — Para 2511 (p. 178–179) · TCR/1078/2019 (p. 177–178)')).toBeInTheDocument();
  // the model's own "Ref:"/"Submitted" prose must NOT leak into the rendered note
  expect(screen.queryByText(/Paras 2511, 2507–2509/)).not.toBeInTheDocument();
  expect(screen.queryByText('Submitted for consideration.')).not.toBeInTheDocument();
  expect(screen.getByText('Assembled from the cited passages — review before submitting.')).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('button', { name: /Source 1: IRCM Vol\. II, verified text/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Source 2: TCR\/1078\/2019, verified text/ })).toBeInTheDocument();
});

it('citation chip click delegates to onCite with the matching source', () => {
  const onCite = vi.fn();
  render(<DraftedNote note={NOTE} sources={[S1, S2]} onCite={onCite} />);
  fireEvent.click(screen.getByRole('button', { name: /Source 2:/ }));
  expect(onCite).toHaveBeenCalledWith(S2);
});

it('renders nothing when no note block survives with a real citation', () => {
  const structuralOnly: ConclusionBlock[] = [{ text: 'Submitted for consideration.', citations: [] }];
  const { container } = render(<DraftedNote note={structuralOnly} sources={[S1, S2]} onCite={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

it('buildNoteText retains full provenance: Ref line, numbered [n] marks, and a footer resolving each [n]', () => {
  const text = buildNoteText(NOTE, [S1, S2]);
  expect(text).toBe(
    `Sub: ${SUB_TEXT}\n` +
    `Ref: IRCM Vol. II — Para 2511 (p. 178–179) · TCR/1078/2019 (p. 177–178)\n` +
    `\n` +
    `1. ${POINT_1} [1]\n` +
    `2. ${POINT_2} [2]\n` +
    `\n` +
    `Assembled from the cited passages — review before submitting.\n` +
    `\n` +
    `Sources:\n` +
    `[1] IRCM Vol. II — Para 2511 (p. 178–179)\n` +
    `[2] TCR/1078/2019 (p. 177–178)`
  );
});

it('Copy note writes the provenance-complete text to the clipboard and confirms via aria-live', async () => {
  render(<DraftedNote note={NOTE} sources={[S1, S2]} onCite={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy note' }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(buildNoteText(NOTE, [S1, S2])));
  const status = await screen.findByText('Copied ✓');
  expect(status).toHaveAttribute('aria-live', 'polite');
});

it('Export downloads the same provenance-complete text as railcite-justification-note.txt and revokes the object URL', async () => {
  let blobText = '';
  (URL.createObjectURL as ReturnType<typeof vi.fn>).mockImplementation((b: Blob) => {
    void b.text().then(t => { blobText = t; });
    return 'blob:mock-url';
  });
  const realCreateElement = document.createElement.bind(document);
  let anchor: HTMLAnchorElement | null = null;
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreateElement(tag);
    if (tag === 'a') anchor = el as HTMLAnchorElement;
    return el;
  });

  render(<DraftedNote note={NOTE} sources={[S1, S2]} onCite={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));

  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect(anchor?.download).toBe('railcite-justification-note.txt');
  await waitFor(() => expect(blobText).toBe(buildNoteText(NOTE, [S1, S2])));
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url'));
});
