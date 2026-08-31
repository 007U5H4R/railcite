// Starter prompts shown on the empty Ask screen. They must land on the ingested corpus so a
// first-time tap returns a real cited answer, never a refuse.
//
// This lives in lib/ (not inside EmptyState) so scripts/smoke-starters.ts can import it without
// pulling a React component and its CSS into a plain Node process — the promise above is only
// real because a deploy gate can check it.
export const EXAMPLE_CASES = [
  'Consignee requests waiver of demurrage for wagons detained beyond free time — is it admissible, and which authority can sanction it?',
  'What is the wharfage applicability on containerised cargo lying in the terminal beyond free time when the consignee cites heavy rains?',
  'Which authority can sanction a demurrage or wharfage waiver, and up to what monetary limit?',
  'When is weighment of a wagon-load dispensed with, and how is a punitive charge for overloading assessed?',
  'What is the current haulage rate for bulk cement moved by container rakes (CRT), and which corrigendum governs it?',
];
