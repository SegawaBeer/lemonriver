import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { FolderIconChip, SystemViewIcon } from '../../components/sidebar/folder-item';
import type { Folder } from '../../lib/sdk';
import { useLrText } from '../text';

export function RenameDialog({
  open,
  initialName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useLocale();
  const lr = useLrText();
  const [value, setValue] = useState(initialName);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialName);
    setInvalid(false);
    setBusy(false);
    queueMicrotask(() => inputRef.current?.select());
  }, [open, initialName]);

  const submit = async () => {
    const name = value.trim();
    if (!name) {
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    if (name === initialName) return onOpenChange(false);
    setBusy(true);
    try {
      await onSubmit(name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.home.renameDialogTitle}</DialogTitle>
          <DialogDescription>{lr.home.renameHint}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-1.5"
        >
          <label className="text-[14px] font-medium" htmlFor="lr-rename">
            {t.home.slideNamePlaceholder}
          </label>
          <input
            id="lr-rename"
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (invalid) setInvalid(false);
            }}
            maxLength={80}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'lr-rename-error' : undefined}
            className="lr-input"
          />
          <p id="lr-rename-error" className="min-h-5 text-[13px] text-destructive">
            {invalid ? lr.home.nameRequired : ''}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MoveDialog({
  open,
  slideName,
  folders,
  currentFolderId,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  slideName: string;
  folders: Folder[];
  currentFolderId: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (folderId: string | null) => Promise<void>;
}) {
  const t = useLocale();
  const [selected, setSelected] = useState<string | null>(currentFolderId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(currentFolderId);
    setBusy(false);
  }, [open, currentFolderId]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(selected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.home.moveDialogTitle}</DialogTitle>
          <DialogDescription>
            {t.home.moveDialogDescriptionPrefix}
            <span className="font-medium text-foreground">{slideName}</span>
            {t.home.moveDialogDescriptionSuffix}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
          <FolderChoice
            chip={<SystemViewIcon kind="draft" className="text-muted-foreground" />}
            label={t.home.draft}
            active={selected === null}
            onClick={() => setSelected(null)}
          />
          {folders.map((f) => (
            <FolderChoice
              key={f.id}
              chip={<FolderIconChip icon={f.icon} />}
              label={f.name}
              active={selected === f.id}
              onClick={() => setSelected(f.id)}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button size="sm" disabled={busy || selected === currentFolderId} onClick={submit}>
            {t.common.move}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderChoice({
  chip,
  label,
  active,
  onClick,
}: {
  chip: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-11 w-full items-center gap-3 rounded-[12px] border-[1.5px] px-3 text-left text-[14px] outline-none',
        'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/40',
        active
          ? 'border-[var(--lr-accent)] bg-[var(--lr-accent-soft)] font-semibold'
          : 'border-border hover:bg-muted',
      )}
    >
      {chip}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check className="size-4 shrink-0" aria-hidden />}
    </button>
  );
}

/** Danger confirmation: the button only works once the deck's name is typed. */
export function TypedConfirmDialog({
  open,
  name,
  title,
  hint,
  label,
  action,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  name: string;
  title: string;
  hint: ReactNode;
  label: string;
  action: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useLocale();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue('');
    setBusy(false);
  }, [open]);

  const matches = value.trim() === name.trim();
  const confirm = async () => {
    if (!matches) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
          className="flex flex-col gap-1.5"
        >
          <label className="text-[14px] font-medium" htmlFor="lr-typed-confirm">
            {label}
          </label>
          <input
            id="lr-typed-confirm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={name}
            className="lr-input"
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="destructive" size="sm" disabled={!matches || busy}>
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
