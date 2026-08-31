// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { LanguageToggle } from '@/components/LanguageToggle';
import type { Language } from '@/lib/i18n';

// A tiny controlled harness so we test the toggle as it's really used (value + onChange).
function Harness({ label }: { label?: string }) {
  const [lang, setLang] = useState<Language>('en');
  return <LanguageToggle value={lang} onChange={setLang} label={label} />;
}

it('is a labelled group with two real buttons, English pressed by default', () => {
  render(<Harness label="Response language" />);
  expect(screen.getByRole('group', { name: /response language/i })).toBeInTheDocument();
  const en = screen.getByRole('button', { name: /english/i });
  const hi = screen.getByRole('button', { name: /hindi/i });
  expect(en).toHaveAttribute('aria-pressed', 'true');
  expect(hi).toHaveAttribute('aria-pressed', 'false');
});

it('clicking हिं switches the pressed state to Hindi, and the labels localize with it', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /show in hindi/i }));
  // Once Hindi is active the control announces itself in Hindi — a Hindi-reading screen-reader
  // user previously heard English-only announcements from a fully translated segment.
  const hi = screen.getByRole('button', { name: 'हिंदी में दिखाएँ' });
  const en = screen.getByRole('button', { name: 'अंग्रेज़ी में दिखाएँ' });
  expect(hi).toHaveAttribute('aria-pressed', 'true');
  expect(en).toHaveAttribute('aria-pressed', 'false');
});

it('calls onChange with the chosen language', () => {
  const onChange = vi.fn();
  render(<LanguageToggle value="en" onChange={onChange} label="Note language" />);
  fireEvent.click(screen.getByRole('button', { name: /show in hindi/i }));
  expect(onChange).toHaveBeenCalledWith('hi');
});
