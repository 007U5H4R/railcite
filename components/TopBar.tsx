export function TopBar({ accountSlot }: { accountSlot?: React.ReactNode }) {
  return (
    <header role="banner" className="topbar">
      <span className="wordmark">RailCite</span>
      <span className="topbar-spacer" />
      {accountSlot}
    </header>
  );
}
