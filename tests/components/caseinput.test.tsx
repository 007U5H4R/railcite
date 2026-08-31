// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseInput } from '@/components/CaseInput';
it('submits via plain Enter and the button, but not Shift+Enter', () => {
  const onSubmit = vi.fn();
  render(<CaseInput value="Wagons detained beyond free time" onChange={() => {}} onSubmit={onSubmit} />);
  const ta = screen.getByRole('textbox', { name: /describe your case/i });
  fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });   // newline, not submit
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.keyDown(ta, { key: 'Enter' });                   // plain Enter submits
  fireEvent.click(screen.getByRole('button', { name: /find the rule/i }));
  expect(onSubmit).toHaveBeenCalledTimes(2);
});
it('disables submit under 10 chars', () => {
  render(<CaseInput value="short" onChange={() => {}} onSubmit={() => {}} />);
  expect(screen.getByRole('button', { name: /find the rule/i })).toBeDisabled();
});
