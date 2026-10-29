import type { ViteDevServer } from 'vite';
import type { ApiContext } from '../vite/routes/context.ts';
import { registerAgentProviderRoutes } from './agent/providers/routes.ts';
import { registerBoardRoutes } from './board/routes.ts';
import { registerDeckRoutes } from './decks/routes.ts';
import { registerOutlineRoutes } from './outline/routes.ts';
import { registerTrashRoutes } from './trash/routes.ts';

export function registerLemonRiverRoutes(server: ViteDevServer, ctx: ApiContext): void {
  registerBoardRoutes(server, ctx);
  registerTrashRoutes(server, ctx);
  registerDeckRoutes(server, ctx);
  registerOutlineRoutes(server, ctx);
  registerAgentProviderRoutes(server, ctx);
}
