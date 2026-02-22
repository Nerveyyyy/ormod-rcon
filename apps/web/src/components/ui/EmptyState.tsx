interface EmptyStateProps {
  icon?: string;
  title: string;
  desc?: string;
}

export default function EmptyState({ icon = '◈', title, desc }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      {desc && <div className="empty-state-desc">{desc}</div>}
    </div>
  );
}
