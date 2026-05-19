// Parallel slots: `children` is the library grid; `modal` is the intercepting
// route slot. When a student clicks a card on the grid, the
// @modal/(.)cards/[cardId] route intercepts and renders into the modal slot
// while the grid stays in children. Direct navigation to
// /student/library/cards/[cardId] (refresh, deep link) bypasses the intercept
// and renders the full-page route instead.

export default function LibraryLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
