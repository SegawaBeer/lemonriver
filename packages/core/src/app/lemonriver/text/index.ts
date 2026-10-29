import { useLocale } from '@/lib/use-locale';
import { lrTextFor } from './all';
import type { LrText } from './types';

export { lrTextFor } from './all';

export function useLrText(): LrText {
  return lrTextFor(useLocale().id);
}
