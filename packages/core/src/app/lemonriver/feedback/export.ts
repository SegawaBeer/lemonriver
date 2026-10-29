import type { Locale } from '../../../locale/types';
import { lrTextFor } from '../text/all';

/** What to tell someone whose export just failed, under the official message. */
export function exportFailedHint(t: Locale): string {
  return lrTextFor(t.id).feedback.exportFailedHint;
}
