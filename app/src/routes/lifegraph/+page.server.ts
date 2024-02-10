import { nodes } from "$db/nodes";
import { links } from "$db/links";
import type {PageServerLoad, Actions} from './$types'

export const load: PageServerLoad = async function() {
	const allNodes = await nodes.find({}).toArray();
	const allLinks = await links.find({}).toArray();
	const nodesSet = allNodes.map(v => ({...v, _id:v._id.toString()}))
	const linksSet = allLinks.map(v => ({...v, _id:v._id.toString()}))

	return {
		nodes: nodesSet.map(d => {
			let linkSet = linksSet.filter((link) => link.target == d.node_id)
			d.size = `${linkSet?.length > 0 ? (linkSet.length * 3)+2 : 3}`
			return d;
		}),
        links: linksSet
	}
}

export const actions: Actions = {
	addnode: async ({request}) => {
		const data = await request.formData();
		const dbEntry = {
			node_id: data.get("node_id"),
			label: data.get("label"),
			type: data.get("type"),
			description: data.get("description"),
			date: data.get("date"),
			media: {
				link: data.get("link"),
				image: data.get("image"),
				video: data.get("video")
			}
		};
		nodes.insertOne(dbEntry)
	},
	addlink: async ({request}) => {
		const data = await request.formData();
		const dbEntry = {
			source: data.get("source"),
			target: data.get("target"),
			description: data.get("description")
		};
		links.insertOne(dbEntry)
	}
}