// Parallel slots: `children` is the Cards page (hero + browser); `modal`
// is the intercepting reader slot. Clicking a card on the browser triggers
// @modal/(.)[cardId] into `modal` while the page stays in `children`.
// Direct navigation / refresh of /student/cards/[cardId] bypasses the
// intercept and renders the full-page reader instead.

export default function CardsLayout({
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
