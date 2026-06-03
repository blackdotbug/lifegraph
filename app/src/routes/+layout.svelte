<script>
	import './styles.css';

	let { children } = $props();
</script>

<div class="app">
	<main>
		{@render children?.()}
	</main>

	<footer>
		<p>
			Heather Bree's Lifegraph &middot; <a href="https://github.com/blackdotbug/lifegraph"
				>source on GitHub</a
			>
		</p>
	</footer>
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
		max-width: 90vw;
		margin: 0 auto;
		box-sizing: border-box;
	}

	footer {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 0px;
	}

	footer a {
		font-weight: bold;
	}

	@media (min-width: 480px) {
		footer {
			padding: 0;
		}
	}
</style>
