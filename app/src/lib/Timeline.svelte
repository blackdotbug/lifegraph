<script>
	// Lightweight vertical timeline, replacing the unmaintained svelte-vertical-timeline lib.
	// `events` is expected pre-sorted (newest first) with { node_id, dateString, label }.
	let { events, activeId = null, onselect, dotColor = '#333' } = $props();
</script>

<ul class="timeline">
	{#each events as event (event.node_id)}
		<li class="timeline-item" class:active={activeId === event.node_id}>
			<div class="opposite">
				<p>{event.dateString}</p>
			</div>
			<div class="separator">
				<span class="dot" style:--dot-color={dotColor}></span>
				<span class="connector"></span>
			</div>
			<div class="content">
				<button id={event.node_id} onclick={() => onselect?.(event)}>
					<p>{event.label}</p>
				</button>
			</div>
		</li>
	{/each}
</ul>

<style>
	ul.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li.timeline-item {
		display: flex;
		align-items: stretch;
		min-height: 44px;
	}
	.opposite {
		flex: 0 0 64px;
		text-align: right;
		padding: 8px 8px 0 0;
	}
	.opposite p {
		margin: 0;
		font-size: 0.8em;
		white-space: nowrap;
	}
	.separator {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 18px;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--dot-color);
		background-color: var(--dot-color);
		margin-top: 8px;
		flex: 0 0 auto;
	}
	.connector {
		flex: 1 1 auto;
		width: 2px;
		background: #bdbdbd;
		margin: 2px 0;
	}
	li.timeline-item:last-child .connector {
		display: none;
	}
	.content {
		flex: 1;
		padding: 4px 0 8px 8px;
		min-width: 0;
	}
	.content button {
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 6px;
	}
	.content button p {
		margin: 0;
	}
	li.timeline-item.active .dot {
		background-color: var(--selected);
		border-color: var(--selected);
	}
	li.timeline-item.active .content button {
		background-color: color-mix(in srgb, var(--selected) 22%, transparent);
		font-weight: 700;
	}
</style>
