import { FeedbackScreen } from '@/components/FeedbackScreen';

// Feedback route — a free-text box for signed-in users to send product feedback (persisted via
// /api/feedback). Renders inside the app Shell provided by app/layout.tsx.
export default function FeedbackPage() {
  return <FeedbackScreen />;
}
