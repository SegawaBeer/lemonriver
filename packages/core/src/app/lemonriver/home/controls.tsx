import { ArrowDownAZ, ChevronDown, Clock, Search, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { SORT_KEYS, type SortKey } from './sorting';

export function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useLocale();
  return (
    <label className="relative flex h-9 w-full items-center gap-2 rounded-full border-[1.5px] border-border bg-card px-3 focus-within:border-[var(--lr-focus)] md:w-[240px]">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.home.searchPlaceholder}
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t.home.clearSearch}
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <X className="size-3.5" />
        </button>
      )}
    </label>
  );
}

export function SortControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
}) {
  const t = useLocale();
  const labels: Record<SortKey, string> = {
    'created-desc': t.home.sortByCreatedDesc,
    'created-asc': t.home.sortByCreatedAsc,
    'title-asc': t.home.sortByTitleAsc,
    'title-desc': t.home.sortByTitleDesc,
  };
  const Icon = ({ k }: { k: SortKey }) =>
    k === 'title-asc' || k === 'title-desc' ? (
      <ArrowDownAZ className="size-4 text-muted-foreground" aria-hidden />
    ) : (
      <Clock className="size-4 text-muted-foreground" aria-hidden />
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${t.home.sortLabel}: ${labels[value]}`}
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card pr-2.5 pl-3 text-[14px] font-medium text-foreground outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Icon k={value} />
            <span>{labels[value]}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {SORT_KEYS.map((key) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onChange(key)}
            className={cn(value === key && 'bg-muted text-foreground')}
          >
            <Icon k={key} />
            <span>{labels[key]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
