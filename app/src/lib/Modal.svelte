<script>
	let { showModal = $bindable(), children } = $props();

	let dialog = $state(); // HTMLDialogElement

	$effect(() => {
		if (dialog && showModal) dialog.showModal();
	});
</script>

<dialog
	bind:this={dialog}
	onclose={() => (showModal = false)}
	onclick={(e) => {
		if (e.target === dialog) dialog.close();
	}}
>
	<!-- Clicks on inner content keep e.target !== dialog, so they don't close it. -->
	<div>
		{@render children?.()}
		<hr />
		<!-- svelte-ignore a11y_autofocus -->
		<button autofocus onclick={() => dialog.close()}>close</button>
	</div>
</dialog>

<style>
	dialog {
		max-width: min(90vw, 860px);
		max-height: 88vh;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		padding: 0;
		background: var(--bg);
		color: var(--text);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
		overflow: auto;
	}
	dialog::backdrop {
		background: rgba(20, 14, 24, 0.55);
		backdrop-filter: blur(2px);
	}
	dialog > div {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}
	dialog hr {
		width: 100%;
		border: none;
		border-top: 1px solid var(--border);
		margin: 0.25rem 0 0;
	}
	dialog > div > button {
		align-self: flex-end;
		cursor: pointer;
		border: 1px solid var(--border);
		background: #fff;
		color: var(--text);
		font-weight: 600;
		border-radius: 999px;
		padding: 0.35rem 1.1rem;
	}
	dialog > div > button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	dialog[open] {
		animation: zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes zoom {
		from {
			transform: scale(0.95);
		}
		to {
			transform: scale(1);
		}
	}
	dialog[open]::backdrop {
		animation: fade 0.2s ease-out;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
