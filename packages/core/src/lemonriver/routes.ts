import type { ViteDevServer } from 'vite';
import type { ApiContext } from '../vite/routes/context.ts';
import { registerBoardRoutes } from './board/routes.ts';

export function registerLemonRiverRoutes(server: ViteDevServer, ctx: ApiContext): void {
  registerBoardRoutes(server, ctx);
}
