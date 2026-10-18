import { Container, SectionHeading } from './frame';

const changes = [
  {
    title: 'Renamed throughout',
    body: 'The packages publish as @lemonriver/core and @lemonriver/cli, the CLI runs as lemonriver, and the config file is lemonriver.config.ts.',
  },
  {
    title: 'A story board for a deck',
    body: 'Lay a deck out as chapter columns on a pannable canvas: drag a card to reorder, open a page in the editor, write speaker notes on the card, or drop a blank page into a column.',
  },
  {
    title: 'Workspaces written before the rename still work',
    body: 'No edits needed. The old package name, the old open-slide command, and open-slide.config.ts all still resolve, so a deck authored earlier keeps running as-is.',
  },
  {
    title: 'Its own version line',
    body: 'LemonRiver starts at 0.1.0, built on open-slide 2.0.1. The framework history before the fork is kept alongside the new changelog.',
  },
];

export function Fork() {
  return (
    <section id="fork">
      <Container className="pb-20 sm:pb-28">
        <SectionHeading
          eyebrow="Relationship to upstream"
          title="Built on open-slide"
          lead="LemonRiver is a second development of open-slide, the React-first slide framework. It follows upstream releases and carries its own changes on top."
        />
        <ul data-reveal className="mx-auto grid max-w-[900px] gap-5 sm:grid-cols-2">
          {changes.map((change) => (
            <li
              key={change.title}
              className="flex flex-col gap-2 rounded-2xl border border-[color:var(--color-rule)] bg-[color:var(--color-panel)] p-6"
            >
              <h3 className="text-[16px] font-medium tracking-[-0.01em] text-[color:var(--color-text)]">
                {change.title}
              </h3>
              <p className="text-pretty text-[14.5px] leading-[1.6] text-[color:var(--color-text-soft)]">
                {change.body}
              </p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
