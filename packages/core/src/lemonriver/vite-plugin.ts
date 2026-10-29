import type { HtmlTagDescriptor, Plugin } from 'vite';
import {
  BRAND_PATH_SOURCE,
  PREVIEW_PATH_SOURCE,
  REDUCE_MOTION_KEY,
  SPLASH_ID,
} from '../app/lemonriver/theme/pages.ts';

/**
 * Runs before the bundle: marks <html> for our styles, picks the lime look on
 * the pages that wear it, and shows the splash until the app mounts. The
 * preview route renders agent screenshots, so it gets no splash. The official
 * script above it has already toggled `dark`.
 */
export function prePaintScript(base: string): string {
  const prefix = JSON.stringify(base.replace(/\/+$/, ''));
  return [
    '(function(){',
    "var d=document.documentElement;d.setAttribute('data-lr-app','');",
    `var b=${prefix},p=location.pathname;if(b&&p.indexOf(b)===0)p=p.slice(b.length)||'/';`,
    `var brand=new RegExp(${JSON.stringify(BRAND_PATH_SOURCE)}).test(p);`,
    `var preview=new RegExp(${JSON.stringify(PREVIEW_PATH_SOURCE)}).test(p);`,
    "var theme=null;try{theme=localStorage.getItem('theme');",
    `if(localStorage.getItem(${JSON.stringify(REDUCE_MOTION_KEY)})==='1')d.setAttribute('data-lr-reduce-motion','');}catch(e){}`,
    "if(theme==='lime'){d.classList.remove('dark');d.classList.add('lime');d.style.colorScheme='light';}",
    "if(brand)d.setAttribute('data-lr-brand','');",
    "if(!preview)d.setAttribute('data-lr-splash','');",
    '})();',
  ].join('');
}

const SPLASH_STYLE = `
#${SPLASH_ID}{display:none}
html[data-lr-splash] #${SPLASH_ID}{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;pointer-events:none;
background:linear-gradient(160deg,#eef56a 0%,#c9e23f 40%,#9bc929 100%);color:#12300f;
font:700 28px/1.2 -apple-system,BlinkMacSystemFont,"SF Pro Display","Inter","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
opacity:0;animation:lr-splash-in 240ms cubic-bezier(.2,.8,.2,1) 200ms forwards;transition:opacity 240ms cubic-bezier(.2,.8,.2,1)}
#${SPLASH_ID} div{display:flex;align-items:center;gap:14px}
#${SPLASH_ID} img{width:56px;height:56px}
#${SPLASH_ID}[data-leaving]{opacity:0!important;animation:none}
@keyframes lr-splash-in{to{opacity:1}}
@media (prefers-reduced-motion: reduce){html[data-lr-splash] #${SPLASH_ID}{animation:none;opacity:1;transition:none}}
html[data-lr-reduce-motion] #${SPLASH_ID}{animation:none;opacity:1;transition:none}
`;

export function lemonRiverAppPlugin(): Plugin {
  let base = '/';
  return {
    name: 'lemonriver:app',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const tags: HtmlTagDescriptor[] = [
          {
            tag: 'link',
            attrs: { rel: 'apple-touch-icon', href: './lemonriver/brand/apple-touch-icon.png' },
            injectTo: 'head',
          },
          { tag: 'style', children: SPLASH_STYLE, injectTo: 'head' },
          { tag: 'script', children: prePaintScript(base), injectTo: 'head' },
          {
            tag: 'div',
            attrs: { id: SPLASH_ID, 'aria-hidden': 'true' },
            children: [
              {
                tag: 'div',
                children: [
                  { tag: 'img', attrs: { src: './lemonriver/brand/app-icon.svg', alt: '' } },
                  { tag: 'span', children: 'LemonRiver' },
                ],
              },
            ],
            injectTo: 'body-prepend',
          },
        ];
        return { html, tags };
      },
    },
  };
}
