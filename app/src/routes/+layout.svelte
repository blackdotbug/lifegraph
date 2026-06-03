<script>
	import './styles.css';
	import wallpaper from '$lib/assets/mushrooms.jpg';

	let { children } = $props();
</script>

<div class="app" style:background-image={`url(${wallpaper})`}>
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

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		/* The wallpaper tile, applied here (not on body) so Vite resolves the asset
		   URL with the production base path. background-image comes from the inline
		   style above. */
		background-repeat: repeat;
		background-size: var(--wp-size, 420px);
		background-attachment: fixed;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 1.25rem;
		width: 100%;
		/* Narrower than before so more of the wallpaper shows in the side margins. */
		max-width: 1040px;
		margin: 0 auto;
		box-sizing: border-box;
	}

	footer {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 1.25rem;
		font-size: 0.9rem;
	}

	/* Opaque pill so the footer stays legible over the wallpaper. */
	footer p {
		margin: 0;
		padding: 0.4rem 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		box-shadow: var(--shadow);
		color: var(--muted);
	}

	footer a {
		font-weight: 600;
	}
</style>
