<script>
	import { onMount } from 'svelte';

	/** @typedef {{node_id:string,label:string,type:string,description?:string,date?:string,media?:any}} LifeNode */
	/** @typedef {{source:string,target:string,description?:string}} LifeLink */

	/** @type {LifeNode[]} */
	let nodes = $state([]);
	/** @type {LifeLink[]} */
	let links = $state([]);
	let loading = $state(true);
	let message = $state('');
	let errorMsg = $state('');

	const TYPES = ['pillar', 'event', 'person', 'location'];

	function blankNode() {
		return {
			node_id: '',
			label: '',
			type: 'event',
			description: '',
			date: '',
			media: { image: '', video: '', link: '', gallery: '' }
		};
	}
	function blankLink() {
		return { source: '', target: '', description: '' };
	}

	let nodeForm = $state(blankNode());
	let linkForm = $state(blankLink());
	/** @type {number | null} */
	let linkEditIndex = $state(null);

	const sortedNodes = $derived(
		[...nodes].sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label))
	);
	const nodeOptions = $derived([...nodes].sort((a, b) => a.label.localeCompare(b.label)));

	/** @param {string} id */
	function nodeLabel(id) {
		return nodes.find((n) => n.node_id === id)?.label ?? id;
	}

	function flash(/** @type {string} */ msg) {
		message = msg;
		errorMsg = '';
	}

	/**
	 * @param {string} path
	 * @param {string} method
	 * @param {any} [body]
	 */
	async function api(path, method, body) {
		errorMsg = '';
		const res = await fetch(`/__admin/api${path}`, {
			method,
			headers: body ? { 'Content-Type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
		if (Array.isArray(data.nodes)) nodes = data.nodes;
		if (Array.isArray(data.links)) links = data.links;
		return data;
	}

	onMount(async () => {
		try {
			await api('/data', 'GET');
		} catch (e) {
			errorMsg = String(e);
		} finally {
			loading = false;
		}
	});

	// ---- Nodes ----
	/** @param {LifeNode} n */
	function editNode(n) {
		const m = n.media ?? {};
		nodeForm = {
			node_id: n.node_id,
			label: n.label,
			type: n.type,
			description: n.description ?? '',
			date: n.date ?? '',
			media: {
				image: m.image ?? '',
				video: m.video ?? '',
				link: m.link ?? '',
				gallery: (m.gallery ?? []).join('\n')
			}
		};
		message = `Editing ${n.node_id}`;
		errorMsg = '';
	}

	function resetNodeForm() {
		nodeForm = blankNode();
		message = '';
	}

	async function saveNode() {
		try {
			const payload = {
				node_id: nodeForm.node_id || undefined,
				label: nodeForm.label,
				type: nodeForm.type,
				description: nodeForm.description,
				date: nodeForm.type === 'event' ? nodeForm.date : undefined,
				media: {
					image: nodeForm.media.image,
					video: nodeForm.media.video,
					link: nodeForm.media.link,
					gallery: nodeForm.media.gallery
						.split('\n')
						.map((/** @type {string} */ s) => s.trim())
						.filter(Boolean)
				}
			};
			const data = await api('/node', 'POST', { node: payload });
			flash(`Saved ${data.saved.node_id}`);
			resetNodeForm();
		} catch (e) {
			errorMsg = String(e);
		}
	}

	/** @param {LifeNode} n */
	async function deleteNode(n) {
		if (!confirm(`Delete node "${n.label}" (${n.node_id})?`)) return;
		try {
			const data = await api('/node/delete', 'POST', { node_id: n.node_id });
			if (data.blocked) {
				if (
					confirm(`${data.message}\n\nDelete the node AND its ${data.referencingLinks} link(s)?`)
				) {
					await api('/node/delete', 'POST', { node_id: n.node_id, cascade: true });
					flash(`Deleted ${n.node_id} and its links`);
				}
			} else {
				flash(`Deleted ${n.node_id}`);
			}
		} catch (e) {
			errorMsg = String(e);
		}
	}

	// ---- Links ----
	/** @param {number} i */
	function editLink(i) {
		const l = links[i];
		linkForm = { source: l.source, target: l.target, description: l.description ?? '' };
		linkEditIndex = i;
		message = `Editing link #${i}`;
		errorMsg = '';
	}

	function resetLinkForm() {
		linkForm = blankLink();
		linkEditIndex = null;
		message = '';
	}

	async function saveLink() {
		try {
			await api('/link', 'POST', {
				link: linkForm,
				index: linkEditIndex ?? undefined
			});
			flash(linkEditIndex === null ? 'Added link' : `Saved link #${linkEditIndex}`);
			resetLinkForm();
		} catch (e) {
			errorMsg = String(e);
		}
	}

	/** @param {number} i */
	async function deleteLink(i) {
		if (!confirm(`Delete link ${nodeLabel(links[i].source)} → ${nodeLabel(links[i].target)}?`))
			return;
		try {
			await api('/link/delete', 'POST', { index: i });
			flash('Deleted link');
			if (linkEditIndex === i) resetLinkForm();
		} catch (e) {
			errorMsg = String(e);
		}
	}
</script>

<svelte:head>
	<title>Lifegraph Admin</title>
</svelte:head>

<h1>Lifegraph Admin</h1>
<p class="hint">
	Local-only editor. Changes write directly to the data JSON files. Commit and rebuild to deploy.
</p>

{#if errorMsg}
	<p class="msg error">{errorMsg}</p>
{:else if message}
	<p class="msg ok">{message}</p>
{/if}

{#if loading}
	<p>Loading…</p>
{:else}
	<div class="cols">
		<!-- NODES -->
		<section>
			<h2>Nodes ({nodes.length})</h2>

			<form class="card" onsubmit={(e) => (e.preventDefault(), saveNode())}>
				<h3>{nodeForm.node_id ? `Edit ${nodeForm.node_id}` : 'New node'}</h3>
				<label>Label<input bind:value={nodeForm.label} required /></label>
				<label>
					Type
					<select bind:value={nodeForm.type}>
						{#each TYPES as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</label>
				{#if nodeForm.type === 'event'}
					<label>Date<input type="date" bind:value={nodeForm.date} /></label>
				{/if}
				<label>Description<textarea bind:value={nodeForm.description} rows="3"></textarea></label>
				<fieldset>
					<legend>Media</legend>
					<label>Image<input bind:value={nodeForm.media.image} placeholder="filename.jpg" /></label>
					<label>Video<input bind:value={nodeForm.media.video} placeholder="filename.mp4" /></label>
					<label>Link<input bind:value={nodeForm.media.link} placeholder="https://…" /></label>
					<label>
						Gallery (one filename per line)
						<textarea bind:value={nodeForm.media.gallery} rows="3"></textarea>
					</label>
				</fieldset>
				<div class="actions">
					<button type="submit">{nodeForm.node_id ? 'Save' : 'Add'} node</button>
					{#if nodeForm.node_id}
						<button type="button" onclick={resetNodeForm}>Cancel</button>
					{/if}
				</div>
			</form>

			<ul class="list">
				{#each sortedNodes as n (n.node_id)}
					<li>
						<span class="tag {n.type}">{n.type}</span>
						<span class="label">{n.label}</span>
						<span class="id">{n.node_id}</span>
						<span class="row-actions">
							<button type="button" onclick={() => editNode(n)}>edit</button>
							<button type="button" class="danger" onclick={() => deleteNode(n)}>del</button>
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<!-- LINKS -->
		<section>
			<h2>Links ({links.length})</h2>

			<form class="card" onsubmit={(e) => (e.preventDefault(), saveLink())}>
				<h3>{linkEditIndex === null ? 'New link' : `Edit link #${linkEditIndex}`}</h3>
				<label>
					Source
					<select bind:value={linkForm.source} required>
						<option value="" disabled>— pick —</option>
						{#each nodeOptions as n (n.node_id)}
							<option value={n.node_id}>{n.label} ({n.type})</option>
						{/each}
					</select>
				</label>
				<label>
					Target
					<select bind:value={linkForm.target} required>
						<option value="" disabled>— pick —</option>
						{#each nodeOptions as n (n.node_id)}
							<option value={n.node_id}>{n.label} ({n.type})</option>
						{/each}
					</select>
				</label>
				<label>Description<textarea bind:value={linkForm.description} rows="2"></textarea></label>
				<div class="actions">
					<button type="submit">{linkEditIndex === null ? 'Add' : 'Save'} link</button>
					{#if linkEditIndex !== null}
						<button type="button" onclick={resetLinkForm}>Cancel</button>
					{/if}
				</div>
			</form>

			<ul class="list">
				{#each links as l, i (i)}
					<li>
						<span class="label">{nodeLabel(l.source)} → {nodeLabel(l.target)}</span>
						<span class="row-actions">
							<button type="button" onclick={() => editLink(i)}>edit</button>
							<button type="button" class="danger" onclick={() => deleteLink(i)}>del</button>
						</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>
{/if}

<style>
	h1 {
		text-align: left;
	}
	.hint {
		color: #555;
		margin-top: -0.5rem;
	}
	.msg {
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-weight: 600;
	}
	.msg.ok {
		background: #e3f5e1;
		color: #1b5e20;
	}
	.msg.error {
		background: #fde7e7;
		color: #b71c1c;
	}
	.cols {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}
	.cols section {
		flex: 1;
		min-width: 0;
	}
	.card {
		background: rgba(255, 255, 255, 0.6);
		border: 1px solid #ccd;
		border-radius: 10px;
		padding: 1rem;
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.card h3 {
		margin: 0 0 0.25rem;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.85rem;
		font-weight: 600;
		gap: 0.2rem;
	}
	input,
	select,
	textarea {
		font: inherit;
		padding: 0.35rem 0.5rem;
		border: 1px solid #bbc;
		border-radius: 6px;
		font-weight: 400;
	}
	fieldset {
		border: 1px solid #ccd;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	legend {
		font-size: 0.8rem;
		font-weight: 700;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	button {
		cursor: pointer;
		border: 1px solid #99a;
		background: #fff;
		border-radius: 6px;
		padding: 0.35rem 0.75rem;
	}
	button.danger {
		border-color: #d99;
		color: #b71c1c;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		max-height: 60vh;
		overflow-y: auto;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem;
		border-bottom: 1px solid #dde;
	}
	.list .label {
		flex: 1;
		min-width: 0;
	}
	.list .id {
		color: #889;
		font-size: 0.75rem;
		font-family: monospace;
	}
	.row-actions {
		display: flex;
		gap: 0.25rem;
	}
	.row-actions button {
		padding: 0.15rem 0.5rem;
		font-size: 0.8rem;
	}
	.tag {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		text-transform: uppercase;
		background: #eef;
	}
	.tag.pillar {
		background: #ffe0b2;
	}
	.tag.event {
		background: #bbdefb;
	}
	.tag.person {
		background: #c8e6c9;
	}
	.tag.location {
		background: #f8bbd0;
	}
</style>
