// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { RefuseState } from '@/components/RefuseState';
import { ErrorState } from '@/components/ErrorState';

it('refuse: verbatim copy, no red tokens, announces politely', () => {
  render(<RefuseState meta={{ searched: 900, matched: 5, above_threshold: 0 }} onBroaden={null} onRephrase={() => {}} />);
  expect(screen.getByText('No governing circular found for this case.')).toBeInTheDocument();
  expect(screen.getByText(/RailCite won.t guess\. Do not rely on this as an answer\./)).toBeInTheDocument();
  const region = screen.getByRole('status');
  expect(region.className).toMatch(/refuse/);
  expect(region.className).not.toMatch(/err/);
});
it('refuse: Hindi mode localizes the copy and keeps the searched count as a Latin numeral', () => {
  render(<RefuseState meta={{ searched: 900, matched: 5, above_threshold: 0 }} onBroaden={null} onRephrase={() => {}} lang="hi" />);
  expect(screen.getByText('इस मामले के लिए कोई शासी परिपत्र नहीं मिला।')).toBeInTheDocument();
  expect(screen.getByText(/900/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'मामला पुनः लिखें' })).toBeInTheDocument();
});
it('refuse: broaden button only when scope was restricted', () => {
  const onBroaden = vi.fn();
  const { rerender } = render(<RefuseState meta={{ searched: 1, matched: 0, above_threshold: 0 }} onBroaden={onBroaden} onRephrase={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /remove .verified only./i }));
  expect(onBroaden).toHaveBeenCalled();
  rerender(<RefuseState meta={{ searched: 1, matched: 0, above_threshold: 0 }} onBroaden={null} onRephrase={() => {}} />);
  expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
});
it('error: real try-again control', () => {
  const onRetry = vi.fn();
  render(<ErrorState message="Network error" onRetry={onRetry} />);
  fireEvent.click(screen.getByRole('button', { name: /try again/i }));
  expect(onRetry).toHaveBeenCalled();
});
