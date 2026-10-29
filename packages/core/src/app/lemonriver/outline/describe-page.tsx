import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { ConnectView } from '@/components/agent/connect-view';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  createSession,
  sendMessage,
  setActiveSession,
  useAgentStatus,
} from '@/lib/agent/use-agent';
import { uploadWithAutoRename } from '@/lib/assets';
import { format, useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { Mascot } from '../brand/mascot';
import { useLrText } from '../text';
import { checkFileObject, type FileVerdict, formatSize } from './files';
import { MAX_BRIEF, OUTLINE_PAGE_SIZES, type Outline, outlinePrompt } from './model';
import { Steps } from './steps';

const DRAFT_KEY = 'lemonriver:new-deck-draft';

type DraftFile = { key: string; file: File; verdict: FileVerdict };

type StoredDraft = { brief?: unknown; pages?: unknown };

function basePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '');
}

function readDraft(): StoredDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredDraft) : {};
  } catch {
    return {};
  }
}

function writeDraft(brief: string, pages: number): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ brief, pages }));
  } catch {}
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 7)}`;
}

export function DescribePage() {
  const lr = useLrText();
  const locale = useLocale();
  const location = useLocation();
  const { connected, loading, provider } = useAgentStatus();
  const deckId = new URLSearchParams(location.search).get('deck') ?? '';
  const initialState = (location.state ?? {}) as { brief?: unknown };

  const [brief, setBrief] = useState(() => {
    if (typeof initialState.brief === 'string') return initialState.brief.slice(0, MAX_BRIEF);
    const draft = readDraft();
    return typeof draft.brief === 'string' ? draft.brief.slice(0, MAX_BRIEF) : '';
  });
  const [pages, setPages] = useState<number>(() => {
    const draft = readDraft();
    return OUTLINE_PAGE_SIZES.find((size) => size === draft.pages) ?? 8;
  });
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);

  useEffect(() => {
    writeDraft(brief, pages);
  }, [brief, pages]);

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    fetch(`/__lr/outline?slideId=${encodeURIComponent(deckId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { outline: Outline | null } | null) => {
        if (cancelled || !body?.outline) return;
        setBrief(body.outline.brief);
        setPages(body.outline.pages);
        setUploaded(body.outline.files);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const blocked = files.some((entry) => entry.verdict !== 'ok');
  const canStart = brief.trim() !== '' && connected && !blocked && !busy;
  const needsAgent = !loading && !connected;

  async function takeFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming: DraftFile[] = [];
    for (const file of Array.from(list)) {
      incoming.push({ key: fileKey(file), file, verdict: await checkFileObject(file) });
    }
    const target = replacing.current;
    replacing.current = null;
    setFiles((prev) => [...prev.filter((entry) => entry.key !== target), ...incoming]);
  }

  function pick(replaceKey?: string) {
    replacing.current = replaceKey ?? null;
    input.current?.click();
  }

  async function start() {
    if (!canStart || !provider) return;
    setBusy(true);
    try {
      let slideId = deckId;
      if (!slideId) {
        const created = await fetch('/__slides', { method: 'POST' });
        if (!created.ok) throw new Error('create failed');
        slideId = ((await created.json()) as { slideId: string }).slideId;
      }

      const names = [...uploaded];
      for (const entry of files) {
        if (entry.verdict !== 'ok') continue;
        const res = await uploadWithAutoRename(slideId, entry.file);
        if (!res.ok || !res.entry) throw new Error('upload failed');
        names.push(res.entry.name);
      }

      const outline: Outline = {
        state: 'drafting',
        brief: brief.trim(),
        pages,
        files: names,
        items: [],
        updatedAt: Date.now(),
        built: 0,
        paused: false,
        stage: 'pages',
        dispatched: null,
        lastTurn: null,
      };
      const started = await fetch('/__lr/outline/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slideId,
          brief: outline.brief,
          pages,
          files: names,
        }),
      });
      if (!started.ok) throw new Error('start failed');

      const session = await createSession(provider.id, slideId);
      setActiveSession(session.id);
      await sendMessage(session.id, outlinePrompt(outline, slideId, locale.id), { slideId });
      window.location.assign(`${basePath()}/s/${encodeURIComponent(slideId)}/outline`);
    } catch {
      toast.error(lr.outline.startFailed);
      setBusy(false);
    }
  }

  return (
    <div data-lr-new className="max-w-[760px]">
      <Steps current={1} />

      <header className="mt-6 mb-5">
        <h1 className="font-heading text-[28px] font-bold leading-[34px] tracking-[-0.01em]">
          {lr.outline.describeTitle}
        </h1>
      </header>

      <section className="rounded-[16px] border border-border bg-card px-6 py-5 shadow-[var(--lr-shadow-1)]">
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value.slice(0, MAX_BRIEF))}
          placeholder={lr.outline.describePlaceholder}
          aria-label={lr.outline.describeTitle}
          rows={3}
          className="min-h-[88px] resize-none text-[15px]"
        />

        <div className="mt-5">
          <p className="text-[13px] font-semibold">{lr.outline.pagesLabel}</p>
          <div role="radiogroup" aria-label={lr.outline.pagesLabel} className="mt-2 flex gap-2">
            {OUTLINE_PAGE_SIZES.map((size) => (
              // biome-ignore lint/a11y/useSemanticElements: the page count is a row of pills, as in the settings page
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={pages === size}
                aria-label={String(size)}
                onClick={() => setPages(size)}
                className={cn(
                  'h-8 min-w-[52px] rounded-[6px] border px-3 text-[13px] font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40',
                  pages === size
                    ? 'border-[var(--lr-focus)] bg-[var(--lr-accent-soft)] text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-[var(--lr-text-3)]',
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">{lr.outline.filesLabel}</p>
            <Button type="button" variant="outline" size="xs" onClick={() => pick()}>
              {lr.outline.addFile}
            </Button>
          </div>
          {(uploaded.length > 0 || files.length > 0) && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {uploaded.map((name) => (
                <li key={name}>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-1 pl-2.5 text-[12px]">
                    {name}
                    <button
                      type="button"
                      aria-label={`${lr.outline.removeFile}: ${name}`}
                      onClick={() => setUploaded((prev) => prev.filter((item) => item !== name))}
                      className="rounded-full px-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
              {files.map((entry) => (
                <li key={entry.key}>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-1 pl-2.5 text-[12px]">
                    {entry.file.name}
                    <button
                      type="button"
                      aria-label={`${lr.outline.removeFile}: ${entry.file.name}`}
                      onClick={() =>
                        setFiles((prev) => prev.filter((item) => item.key !== entry.key))
                      }
                      className="rounded-full px-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={input}
            type="file"
            multiple
            hidden
            data-lr-files
            onChange={(e) => {
              void takeFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      {files
        .filter((entry) => entry.verdict !== 'ok')
        .map((entry) => (
          <FileProblem
            key={entry.key}
            entry={entry}
            onReplace={() => pick(entry.key)}
            onRemove={() => setFiles((prev) => prev.filter((item) => item.key !== entry.key))}
          />
        ))}

      {needsAgent && (
        <div className="mt-5">
          <ConnectView />
        </div>
      )}

      <div className="mt-6 flex items-center justify-end">
        <Button type="button" disabled={!canStart} onClick={() => void start()}>
          {lr.outline.draftOutline}
        </Button>
      </div>
    </div>
  );
}

function FileProblem({
  entry,
  onReplace,
  onRemove,
}: {
  entry: DraftFile;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const t = useLrText().outline;
  const name = entry.file.name;
  const size = formatSize(entry.file.size);

  const copy =
    entry.verdict === 'too-large'
      ? {
          title: t.tooLargeTitle,
          hint: format(t.tooLargeHint, { name, size }),
          actions: [
            { label: t.replaceFile, run: onReplace },
            { label: t.removeFile, run: onRemove },
          ],
        }
      : entry.verdict === 'locked'
        ? {
            title: format(t.lockedTitle, { name }),
            hint: t.lockedHint,
            actions: [
              { label: t.reupload, run: onReplace },
              { label: t.skipFile, run: onRemove },
            ],
          }
        : {
            title: format(t.unsupportedTitle, { name }),
            hint: t.unsupportedHint,
            actions: [{ label: t.removeFile, run: onRemove }],
          };

  return (
    <div
      data-lr-file-problem={entry.verdict}
      className="mt-3 flex items-start gap-3 rounded-[12px] border border-border bg-card px-4 py-3"
    >
      <Mascot state="needs-you" size={30} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{copy.title}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{copy.hint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {copy.actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="outline"
              size="xs"
              onClick={action.run}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
