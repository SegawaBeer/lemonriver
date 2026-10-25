import type { Locale } from './locale/types';

export type LemonRiverBuildConfig = {
  showSlideBrowser?: boolean;
  showSlideUi?: boolean;
  allowHtmlDownload?: boolean;
};

export type LemonRiverAgentConfig = {
  enabled?: boolean;
};

export type LemonRiverConfig = {
  base?: string;
  slidesDir?: string;
  themesDir?: string;
  assetsDir?: string;
  port?: number;
  allowedHosts?: string[] | true;
  /**
   * @deprecated Pick the UI language from the language switcher in the slide UI
   * instead. When set, this only seeds the initial language until the user
   * chooses one (their choice is then remembered locally).
   */
  locale?: Locale;
  build?: LemonRiverBuildConfig;
  agent?: LemonRiverAgentConfig;
};

/** @deprecated Renamed to {@link LemonRiverConfig}; kept for config files written before the rename. */
export type OpenSlideConfig = LemonRiverConfig;

/** @deprecated Renamed to {@link LemonRiverBuildConfig}. */
export type OpenSlideBuildConfig = LemonRiverBuildConfig;
