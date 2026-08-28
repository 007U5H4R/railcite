import { validateSynthesis } from '@/lib/validate';

const A = (blocks: any[], note: any[] = []) => ({ status: 'answered' as const, blocks, note });

it('passes through valid citations untouched', () => {
  const r = validateSynthesis(A([{ text: 'x [1][2]', citations: [1, 2] }]), 3);
  expect(r).toMatchObject({ status: 'answered', dropped: 0, blocks: [{ citations: [1, 2] }] });
});
it('strips out-of-range and non-integer ns', () => {
  const r = validateSynthesis(A([{ text: 'x', citations: [0, 1, 4, 2.5] }]), 3);
  expect(r).toMatchObject({ status: 'answered', blocks: [{ citations: [1] }] });
});
it('drops a block whose citations are all invalid — and counts it', () => {
  const r = validateSynthesis(A([{ text: 'good', citations: [1] }, { text: 'bad', citations: [9] }]), 2);
  expect(r).toMatchObject({ status: 'answered', dropped: 1 });
  expect((r as any).blocks).toHaveLength(1);
});
it('refuses when every block drops (fabrication caught)', () => {
  expect(validateSynthesis(A([{ text: 'bad', citations: [7] }]), 2)).toEqual({ status: 'refused' });
});
it('refuses when model refused', () => {
  expect(validateSynthesis({ status: 'refused' }, 5)).toEqual({ status: 'refused' });
});
it('dedupes citations preserving order', () => {
  const r = validateSynthesis(A([{ text: 'x', citations: [2, 1, 2] }]), 3);
  expect((r as any).blocks[0].citations).toEqual([2, 1]);
});
it('keeps structural note lines, drops uncited substantive note lines', () => {
  const r = validateSynthesis(A(
    [{ text: 'x', citations: [1] }],
    [{ text: 'Sub: Demurrage waiver', citations: [] },
     { text: 'Ref: TCR/1078/2019', citations: [] },
     { text: 'uncited claim', citations: [] },
     { text: 'cited para', citations: [1] },
     { text: 'Submitted for consideration.', citations: [] }]), 1);
  expect((r as any).note.map((b: any) => b.text)).toEqual(
    ['Sub: Demurrage waiver', 'Ref: TCR/1078/2019', 'cited para', 'Submitted for consideration.']);
});
it('zero sources always refuses', () => {
  expect(validateSynthesis(A([{ text: 'x', citations: [1] }]), 0)).toEqual({ status: 'refused' });
});
it('refuses when answered but blocks array is empty (no real claims)', () => {
  expect(validateSynthesis(A([]), 3)).toEqual({ status: 'refused' });
});
