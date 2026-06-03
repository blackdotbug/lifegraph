import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { lifegraphAdmin } from './vite-plugin-lifegraph-admin';

export default defineConfig({
	plugins: [sveltekit(), lifegraphAdmin()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
