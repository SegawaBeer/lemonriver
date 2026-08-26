import type { Page, SlideMeta } from '@open-slide/core';

export const meta: SlideMeta = {
  title: 'Alpha Deck',
  theme: 'plain',
  createdAt: '2026-01-03T00:00:00.000Z',
};

const fill = {
  width: '100%',
  height: '100%',
  background: '#101014',
  color: '#f2f2ef',
  padding: 120,
  fontFamily: 'system-ui, sans-serif',
  position: 'relative',
  overflow: 'hidden',
} as const;

const redImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'%3E%3Crect width='1920' height='1080' fill='%23dc2626'/%3E%3C/svg%3E";

const One: Page = () => (
  <div style={fill}>
    <img
      src={redImage}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
    />
    <div
      data-export-layer-foreground
      style={{
        position: 'absolute',
        left: 700,
        top: 360,
        width: 520,
        height: 360,
        background: '#1d4ed8',
        zIndex: 1,
      }}
    />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <h1 style={{ fontSize: 96, margin: 0 }}>Alpha page one</h1>
      <p style={{ fontSize: 40 }}>Opening content</p>
    </div>
  </div>
);

const Two: Page = () => (
  <div style={fill}>
    <h1 style={{ fontSize: 96, margin: 0 }}>Alpha page two</h1>
    <p style={{ fontSize: 40 }}>Middle content</p>
  </div>
);

const Three: Page = () => (
  <div style={fill}>
    <h1 style={{ fontSize: 96, margin: 0 }}>Alpha page three</h1>
    <p style={{ fontSize: 40 }}>Closing content</p>
  </div>
);

export const notes: (string | undefined)[] = ['Alpha speaker note', undefined, 'Alpha final note'];

export default [One, Two, Three] satisfies Page[];
