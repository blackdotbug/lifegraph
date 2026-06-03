import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// The admin tool is local-only: its backend (the lifegraph-admin Vite plugin)
// exists only under `vite dev`. Keep it out of the static build and 404 it in
// any production context.
export const prerender = false;
export const ssr = false;

export function load() {
	if (!dev) error(404, 'Not found');
}
