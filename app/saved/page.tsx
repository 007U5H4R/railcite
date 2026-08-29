import { SavedScreen } from '@/components/SavedScreen';

// Saved route (R4e) — the caller's bookmarked cases (GET /api/cases?saved=1), each
// un-savable in place. Renders inside the app Shell provided by app/layout.tsx.
export default function SavedPage() {
  return <SavedScreen />;
}
