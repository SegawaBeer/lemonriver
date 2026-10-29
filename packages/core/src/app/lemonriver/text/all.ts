import type { Locale } from '../../../locale/types';
import { en } from './en';
import { es } from './es';
import { ja } from './ja';
import type { LrText } from './types';
import { zhCN } from './zh-cn';
import { zhTW } from './zh-tw';

const TEXT: Record<Locale['id'], LrText> = {
  en,
  es,
  ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

export function lrTextFor(id: Locale['id']): LrText {
  return TEXT[id] ?? en;
}
