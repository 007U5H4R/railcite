// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Shell } from '@/components/Shell';

it('renders landmarks, trust footer copy, and slots', () => {
  render(<Shell rail={<div>RAIL</div>} evidence={<div>EVID</div>}><p>CENTER</p></Shell>);
  expect(screen.getByRole('banner')).toHaveTextContent('RailCite');
  expect(screen.getByRole('main')).toHaveTextContent('CENTER');
  expect(screen.getByRole('complementary')).toHaveTextContent('EVID');
  expect(screen.getByRole('contentinfo').textContent).toContain('not an official Indian Railways product');
  expect(screen.getByRole('contentinfo').textContent).toContain('Extractive only');
});
