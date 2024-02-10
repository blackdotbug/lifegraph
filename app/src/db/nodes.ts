import db from '$db/mongo'

export const nodes = db.collection('lifegraph-nodes')