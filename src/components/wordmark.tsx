/**
 * Brand wordmark. "Ranked" carries the bronze brand accent (--primary);
 * "Learning" stays in the inherited text color so the mark reads as one
 * word with a single emphasised half. `short` renders the collapsed "RL"
 * lockup with the same accent split.
 *
 * Sizing / weight / tracking are intentionally left to the caller's
 * className so each placement (sidebar, mobile header, login) keeps its
 * own type scale.
 */
export function Wordmark({
  short = false,
  className,
}: {
  short?: boolean;
  className?: string;
}) {
  if (short) {
    return (
      <span className={className}>
        <span className="text-primary">R</span>L
      </span>
    );
  }
  return (
    <span className={className}>
      <span className="text-primary">Ranked</span>Learning
    </span>
  );
}
