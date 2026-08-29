// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { Shell } from '@/components/Shell';

// Shell mounts TopBar → AccountChip and HistoryDrawer, both of which call useSession()
// (and HistoryDrawer's useRecentCases() calls getAccessToken() too) — all routed through
// lib/supabase-browser's browserClient(), which would otherwise hit the real
// @supabase/supabase-js createClient() and throw ("supabaseUrl is required") with no env
// configured in the test environment. Mock the module so nothing real is touched and
// useSession() settles on a stable signed-out stub.
vi.mock('@/lib/supabase-browser', () => ({
  browserClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => {},
    },
  }),
  getAccessToken: async () => null,
  signInWithGoogle: async () => {},
}));

it('renders the banner, main, and trust-footer landmarks, plus children', () => {
  render(<Shell><p>CENTER</p></Shell>);
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveTextContent('CENTER');
  expect(screen.getByRole('contentinfo').textContent).toContain('not an official Indian Railways product');
  expect(screen.getByRole('contentinfo').textContent).toContain('Extractive only');
});

it('makes the app content and bottom nav inert while the history drawer is open, but not the drawer', () => {
  render(<Shell><p>CENTER</p></Shell>);
  expect(screen.getByRole('main').parentElement).not.toHaveAttribute('inert');
  expect(screen.getByRole('navigation', { name: 'Primary' })).not.toHaveAttribute('inert');

  fireEvent.click(screen.getByRole('button', { name: 'Open history' }));

  expect(screen.getByRole('main').parentElement).toHaveAttribute('inert');
  expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveAttribute('inert');
  expect(screen.getByRole('dialog', { name: 'Case history' })).not.toHaveAttribute('inert');
});
