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
		height: 75vh;
		border-radius: 0.2em;
		border: none;
		padding: 0;
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.3);
	}
	dialog > div {
		padding: 1em;
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
	button {
		display: block;
	}
</style>
