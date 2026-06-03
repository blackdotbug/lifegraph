<script>
	import './styles.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let { children } = $props();

	// --- TEMPORARY theme previewer (remove once a theme is chosen) ---
	const THEMES = [
		{ id: 'circles', label: 'Circles' },
		{ id: 'mushrooms', label: 'Mushrooms' }
	];
	let theme = $state('circles');

	onMount(() => {
		const fromUrl = new URLSearchParams(location.search).get('theme');
		theme = fromUrl || localStorage.getItem('lg-theme') || 'circles';
	});

	$effect(() => {
		if (!browser) return;
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('lg-theme', theme);
	});
</script>

<div class="app">
	<main>
		{@render children?.()}
	</main>

	<footer>
		<p>
			Heather Bree's Lifegraph &middot;
			<a href="https://justheatherbree.com">justheatherbree.com</a>
		</p>
	</footer>
</div>

<!-- TEMPORARY: theme previewer for dialing in the redesign -->
<div class="theme-switcher">
	<label>
		theme
		<select bind:value={theme}>
			{#each THEMES as t (t.id)}
				<option value={t.id}>{t.label}</option>
			{/each}
		</select>
	</label>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 1rem;
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
		box-sizing: border-box;
	}

	footer {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 1.5rem 1rem;
		color: var(--muted);
		font-size: 0.9rem;
	}

	footer a {
		font-weight: 600;
	}

	.theme-switcher {
		position: fixed;
		bottom: 12px;
		right: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		font-size: 0.8rem;
		color: var(--muted);
		box-shadow: var(--shadow);
		backdrop-filter: blur(6px);
		z-index: 50;
	}
	.theme-switcher label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.theme-switcher select {
		border: none;
		background: transparent;
		color: var(--text);
		font-weight: 600;
	}
</style>
