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
</style>
