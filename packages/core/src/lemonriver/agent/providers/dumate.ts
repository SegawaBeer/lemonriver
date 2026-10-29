import { appInstalled } from './detect.ts';

export const DUMATE_BUNDLE = '/Applications/DuMate.app';

// DuMate has no command line of its own. Its bundled agent (a renamed
// opencode) is started by the desktop app against a local proxy on a port the
// app picks at launch, and that proxy carries the app's own login — nothing we
// can start or address ourselves. Until it ships a stable entry point the app
// can drive, it is listed in Settings as not callable.
export function dumateInstalled(): boolean {
  return appInstalled(DUMATE_BUNDLE);
}

export const DUMATE_REASON = 'desktop-only';
