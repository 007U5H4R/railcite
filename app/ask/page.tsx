import { Suspense } from 'react';
import { CaseConsole } from '@/components/CaseConsole';

// Ask route — the cite-or-refuse research console, rendered in the single-column shell.
// Suspense is required here (not decorative): CaseConsole reads useSearchParams() for R4's
// ?case=<id> reopen flow, and Next.js requires a Suspense boundary around any client
// component that calls it.
export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <CaseConsole />
    </Suspense>
  );
}
