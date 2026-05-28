interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  avatar?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  avatar,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-4">
        {avatar}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
