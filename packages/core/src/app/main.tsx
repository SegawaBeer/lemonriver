import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { LR_THEMES } from './lemonriver/theme/themes';
import './styles.css';

// biome-ignore lint/style/noNonNullAssertion: #root is guaranteed by index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      themes={LR_THEMES}
    >
      <App />
    </ThemeProvider>
  </StrictMode>,
);
