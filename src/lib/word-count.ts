// Word counter mirroring the count_words(text) PL/pgSQL function added in
// migration 019. Keep these two implementations in sync — the server-side
// PG function is the authoritative one (it runs inside submit_quest), and
// this TS version powers the live counter under the markdown editor.
//
// Algorithm: strip markdown syntax characters [*_#`>\[\]()] then split on
// whitespace and count non-empty tokens.

const STRIP_REGEX = /[*_#`>\[\]()]/g;

export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const stripped = text.replace(STRIP_REGEX, '');
  let count = 0;
  for (const token of stripped.split(/\s+/)) {
    if (token.length > 0) count++;
  }
  return count;
}
