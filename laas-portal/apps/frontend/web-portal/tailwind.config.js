/* eslint-disable @nx/enforce-module-boundaries */
import uiConfig from '../../../libs/shared/ui/tailwind.config.js';

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './{src,pages,components,app}/**/*.{ts,tsx,js,jsx,html}',
    '!./{src,pages,components,app}/**/*.{stories,spec}.{ts,tsx,js,jsx,html}',
    '../../../libs/shared/ui/src/**/*.{ts,tsx,js,jsx,html}',
    '!../../../libs/shared/ui/src/**/*.{stories,spec}.{ts,tsx,js,jsx,html}',
    //     ...createGlobPatternsForDependencies(__dirname)
  ],
  theme: {
    extend: {
      ...(uiConfig.theme?.extend ?? {}),
    },
  },
  plugins: [...(uiConfig.plugins ?? [])],
};

export default config;
