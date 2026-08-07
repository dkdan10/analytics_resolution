/** Helpers every hand may need. */

import type { Corpus } from "../data";

/** The empty archive dated the day the window closed.
 *
 *  Selected by parsing the MM.DD.YYYY prefix against the corpus's own last date,
 *  never by sorting the filenames: those strings are month-first, so
 *  lexicographic order is not chronological and a shell from December would
 *  sort after one from January. */
export function terminalShell(corpus: Corpus): string | null {
  const iso = corpus.date_range[1];
  for (const name of corpus.empty_32B_shells) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})\./.exec(name);
    if (m && `${m[3]}-${m[1]}-${m[2]}` === iso) return name;
  }
  return null;
}
