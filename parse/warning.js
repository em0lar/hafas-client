'use strict'

const brToNewline = require('@derhuerst/br2nl')
const omit = require('lodash/omit')

const typesByIcon = Object.assign(Object.create(null), {
	HimWarn: 'status'
})

const parseMsgEdge = (ctx) => (e) => {
	const res = omit(e, [
		'icoX',
		'fLocX', 'fromLocation',
		'tLocX', 'toLocation'
	])
	res.icon = e.icon || null
	// todo: rename `Loc` -> `Location` [breaking]
	res.fromLoc = e.fromLocation || null
	res.toLoc = e.toLocation || null
	return res
}
const parseMsgEvent = ({profile}) => (e) => {
	return {
		// todo: rename `Loc` -> `Location` [breaking]
		fromLoc: e.fromLocation || null,
		toLoc: e.toLocation || null,
		start: parse('dateTime', file, e.fDate, e.fTime, null),
		end: parse('dateTime', file, e.tDate, e.tTime, null),
		sections: e.sectionNums || [] // todo: parse
	}
}

const parseWarning = (ctx, w) => {
	const {parsed, profile, res: resp} = ctx

	// todo: act, pub, lead, tckr, prod, comp,
	// todo: cat (1, 2), pubChL, rRefL, impactL
	// pubChL:
	// [ { name: 'timetable',
	// fDate: '20180606',
	// fTime: '073000',
	// tDate: '20180713',
	// tTime: '030000' },
	// { name: 'export',
	// fDate: '20180606',
	// fTime: '073000',
	// tDate: '20180713',
	// tTime: '030000' } ]
	// { name: '1',
	// fDate: '20190219',
	// fTime: '000000',
	// tDate: '20190225',
	// tTime: '120000' }

	const icon = w.icon || null
	const type = icon && icon.type && typesByIcon[icon.type] || 'warning'

	const res = {
		...parsed,
		id: w.hid || null,
		type,
		summary: w.head ? brToNewline(w.head) : null, // todo: decode HTML entities?
		text: w.text ? brToNewline(w.text) : null, // todo: decode HTML entities?
		icon, // todo: parse icon
		priority: w.prio,
		category: w.cat || null // todo: parse to sth meaningful
	}
	if ('prod' in w) res.products = parse('productsBitmask', w.prod)

	if (w.edgeRefL && resp.common && resp.common.himMsgEdgeL) {
		res.edges = w.edgeRefL
		.map(i => resp.common.himMsgEdgeL[i])
		.filter(e => !!e)
		.map(parseMsgEdge(ctx))
	}
	if (w.eventRefL && resp.common && resp.common.himMsgEventL) {
		res.events = w.eventRefL
		.map(i => resp.common.himMsgEventL[i])
		.filter(e => !!e)
		.map(parseMsgEvent(ctx))
	}

	if (w.sDate && w.sTime) res.validFrom = parse('dateTime', file, w.sDate, w.sTime, null)
	if (w.eDate && w.eTime) res.validUntil = parse('dateTime', file, w.eDate, w.eTime, null)
	if (w.lModDate && w.lModTime) res.modified = parse('dateTime', file, w.lModDate, w.lModTime, null)

	return res
}

module.exports = parseWarning
