// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthGate } from '@/components/AuthGate';
it('explains the gate and triggers sign-in', () => {
  const onSignIn = vi.fn();
  render(<AuthGate onSignIn={onSignIn} />);
  expect(screen.getByText(/Sign in with Google to run your case/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
  expect(onSignIn).toHaveBeenCalled();
});
