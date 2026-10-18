import { gitConfig } from '@/lib/shared';
import { FaqItem } from './faq-item';
import { Container, SectionHeading } from './frame';

const repoUrl = `github.com/${gitConfig.owner}/${gitConfig.repo}`;

export type QA = { q: string; a: string };

export const faqs: QA[] = [
  {
    q: 'What is LemonRiver?',
    a: 'LemonRiver is a React-first slide framework where each slide is a .tsx file rendered on a fixed 1920×1080 canvas. Decks are arbitrary code — versioned in your repo, reviewable in pull requests, and authored alongside (or by) AI agents like Claude Code, Cursor, Codex, and Gemini.',
  },
  {
    q: 'How does LemonRiver relate to open-slide?',
    a: 'LemonRiver is a second development of open-slide, the React-first slide framework. It follows upstream releases and carries its own work on top. The packages are named @lemonriver/core and @lemonriver/cli, the CLI runs as `lemonriver`, and the config file is `lemonriver.config.ts`. Workspaces scaffolded before the rename keep working with no edits — the old package name, the old `open-slide` command, and `open-slide.config.ts` all still resolve.',
  },
  {
    q: 'What does LemonRiver add over upstream?',
    a: 'A story board view: it lays a deck out as chapter columns on a pannable canvas, so you can drag cards to reorder, open a page in the editor, write speaker notes on a card, or drop a blank page into a column. The board keeps its own column structure beside the project, so moving a page never re-groups the pages it used to head. The rest of the framework tracks upstream.',
  },
  {
    q: 'How is LemonRiver different from Reveal.js, Slidev, or Spectacle?',
    a: 'Other frameworks lean on Markdown, a DSL, or a constrained component library. LemonRiver gives each slide a full React component on a 1920×1080 canvas, so you can compose any layout, animation, or data visualization you can write in code. The trade-off is fewer guardrails, more control — designed for teams who already think in components.',
  },
  {
    q: 'Which AI coding agents work with LemonRiver?',
    a: 'Any agent that edits React works. LemonRiver ships skills for Claude Code, and the same files are editable by Codex, Cursor, Gemini CLI, OpenCode, Windsurf, Zed, and any other tool that can read and write .tsx files. There is no proprietary protocol — agents work because slides are just code.',
  },
  {
    q: 'Do I need to know React to use LemonRiver?',
    a: 'Basic React knowledge helps, but agents can author the React for you. Many users describe slides in natural language and let the agent generate the .tsx file, then iterate visually using the in-browser inspector. Knowing React unlocks the ceiling; not knowing it is fine for the floor.',
  },
  {
    q: 'How do I get started with LemonRiver?',
    a: 'Run `npx @lemonriver/cli init` to scaffold a workspace. The CLI sets up the @lemonriver/core runtime, the dev server, and example slides. Open the dev server in your browser, ask your agent to draft a deck, and iterate with the visual inspector or by leaving @slide-comment markers in the source.',
  },
  {
    q: 'Is LemonRiver open source?',
    a: `Yes. LemonRiver is MIT-licensed, and the original copyright notice from open-slide is retained. The source lives at ${repoUrl}.`,
  },
];

export function FAQ() {
  return (
    <section id="faq">
      <Container className="pb-24 sm:pb-32">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />

        <dl
          data-reveal="stagger"
          className="mx-auto max-w-[760px] divide-y divide-[color:var(--color-rule-soft)] border-y border-[color:var(--color-rule-soft)]"
        >
          {faqs.map((item, idx) => (
            <FaqItem key={item.q} item={item} index={idx} />
          ))}
        </dl>
      </Container>
    </section>
  );
}
