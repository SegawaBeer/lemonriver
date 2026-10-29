import { importWorkspacePackage } from '../../../agent/detect.ts';
import { extractQuestionBlock, TEXT_QUESTIONS_INSTRUCTION } from '../../../agent/prompt.ts';
import type { AgentProvider, ProviderEvent, ProviderRunOptions } from '../../../agent/provider.ts';
import { createClaudeMapper } from '../../../agent/providers/claude.ts';
import type { ClaudeSdkModule } from '../../../agent/providers/sdk-types.ts';
import type { AgentModelOption, AgentProviderId } from '../../../agent/types.ts';
import { findCommand } from './detect.ts';

const CLAUDE_SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk';

export type CompatibleProviderSpec = {
  id: AgentProviderId;
  name: string;
  // The command line as it is named on PATH; the app bundles below are where
  // the desktop releases keep it.
  command: string;
  fixedPaths: readonly string[];
  models: () => Promise<AgentModelOption[]>;
};

export type CompatibleProvider = AgentProvider & {
  resolveCommand: () => string | null;
};

export function resolveProviderCommand(spec: CompatibleProviderSpec): string | null {
  return findCommand(spec.fixedPaths, spec.command);
}

// These CLIs have no permission hook, so the agent is told to write its
// questions as a tagged block in the reply; this lifts that block back out
// into question items before the turn ends.
export function withQuestions(emit: (event: ProviderEvent) => void) {
  return (event: ProviderEvent): void => {
    if (event.type === 'text-end' && event.text) {
      const asked = extractQuestionBlock(event.text);
      if (asked) {
        if (asked.text.trim()) emit({ ...event, text: asked.text });
        emit({ type: 'questions', questions: asked.questions });
        return;
      }
    }
    emit(event);
  };
}

// A provider that speaks Claude Code's command line. The SDK owns the
// protocol; `pathToClaudeCodeExecutable` points it at the other vendor's
// binary instead of Claude Code's own.
export function createCompatibleProvider(spec: CompatibleProviderSpec): CompatibleProvider {
  const resolveCommand = () => resolveProviderCommand(spec);
  return {
    id: spec.id,
    name: spec.name,
    sdkPackage: CLAUDE_SDK_PACKAGE,
    cliCommand: spec.command,
    askInstruction: TEXT_QUESTIONS_INSTRUCTION,
    // The CLI rejects `--resume-session-at`, so an edited message replays as
    // text instead of rewinding the provider's own history.
    canRewind: false,
    resolveCommand,
    models: spec.models,
    async run(opts: ProviderRunOptions): Promise<void> {
      const cli = resolveCommand();
      if (!cli) throw new Error(`${spec.name} is not installed on this computer.`);
      const sdk = await importWorkspacePackage<ClaudeSdkModule>(opts.cwd, CLAUDE_SDK_PACKAGE);
      if (!sdk || typeof sdk.query !== 'function') {
        throw new Error(`${spec.name} needs ${CLAUDE_SDK_PACKAGE} in this workspace.`);
      }

      if (opts.signal.aborted) return;
      const abortController = new AbortController();
      opts.signal.addEventListener('abort', () => abortController.abort(), { once: true });

      const mapper = createClaudeMapper(withQuestions(opts.emit), opts.cwd);

      let stderr = '';
      const stream = sdk.query({
        prompt: opts.prompt,
        options: {
          cwd: opts.cwd,
          // No permission hook: the CLI has no `--permission-prompt-tool`, so
          // in-workspace edits are approved up front and anything else the CLI
          // would ask about is refused by it.
          permissionMode: 'acceptEdits',
          settingSources: ['user', 'project', 'local'],
          systemPrompt: { type: 'preset', preset: 'claude_code', append: opts.systemPromptAppend },
          includePartialMessages: true,
          abortController,
          pathToClaudeCodeExecutable: cli,
          ...(opts.resume ? { resume: opts.resume } : {}),
          ...(opts.model ? { model: opts.model } : {}),
          stderr: (data: string) => {
            stderr = (stderr + data).slice(-2000);
          },
        },
      });

      try {
        for await (const message of stream) mapper.handle(message);
      } catch (err) {
        if (opts.signal.aborted || mapper.resultSeen) return;
        const base = err instanceof Error ? err.message : String(err);
        const tail = stderr.trim();
        throw new Error(tail && !base.includes(tail) ? `${base}\n${tail}` : base);
      }
    },
  };
}
