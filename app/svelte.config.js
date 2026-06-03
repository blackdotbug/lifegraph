import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		// strict: false lets the build succeed while omitting the dev-only /admin route
		// (it is intentionally unavailable in the static GitHub Pages output).
		adapter: adapter({ strict: false }),
		paths: {
			base: process.env.NODE_ENV === 'production' ? '/lifegraph' : ''
		}
	}
};

export default config;
