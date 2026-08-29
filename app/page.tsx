import { HomeScreen } from '@/components/HomeScreen';

// Home route (R4d) — greeting, primary "New case" CTA, recent cases, and a corpus stat
// line when signed in; a welcome + Google sign-in prompt when signed out. Renders inside
// the app Shell provided by app/layout.tsx.
export default function HomePage() {
  return <HomeScreen />;
}
