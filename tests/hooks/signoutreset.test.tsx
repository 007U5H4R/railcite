// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
vi.mock('@/hooks/useSession', () => ({ useSession: vi.fn() }));

import { useSession } from '@/hooks/useSession';
import { useSignOutReset } from '@/hooks/useSignOutReset';

const session = (user: { id: string } | null, loading = false) =>
  vi.mocked(useSession).mockReturnValue({ user, loading, signOut: async () => {} } as never);

it('fires exactly once on a signed-in → signed-out transition (the shared-machine wipe)', () => {
  const cb = vi.fn();
  session({ id: 'u1' });
  const { rerender } = renderHook(() => useSignOutReset(cb));
  expect(cb).not.toHaveBeenCalled();          // resolving as signed-in is not a transition
  session(null); rerender();
  expect(cb).toHaveBeenCalledTimes(1);        // sign-out → wipe once
  rerender();
  expect(cb).toHaveBeenCalledTimes(1);        // staying signed out never re-fires
});

it('never fires on an anonymous first load, nor while the session is still resolving', () => {
  const cb = vi.fn();
  session(null, true);
  const { rerender } = renderHook(() => useSignOutReset(cb));
  session(null, false); rerender();           // settles anonymous — nothing to wipe
  expect(cb).not.toHaveBeenCalled();
});

it('never fires on sign-in or a same-user refresh', () => {
  const cb = vi.fn();
  session(null);
  const { rerender } = renderHook(() => useSignOutReset(cb));
  session({ id: 'u1' }); rerender();          // sign-in
  session({ id: 'u1' }); rerender();          // token refresh / re-render
  expect(cb).not.toHaveBeenCalled();
});
