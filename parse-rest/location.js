'use strict'

const {parse} = require('qs')

const leadingZeros = /^0+/

const parseLocation = (ctx, l) => {
	const {profile, opt} = ctx

	const id = parse(l.id, {delimiter: '@'})
	const latitude = 'number' === typeof l.lat ? l.lat : (id.Y ? id.Y / 100000 : null)
	const longitude = 'number' === typeof l.long ? l.long : (id.X ? id.X / 100000 : null)

	const res = {
		type: 'location',
		id: (l.extId || id.L || id.b || '').replace(leadingZeros, '') || null,
		latitude, longitude
	}

	if (l.type === 'S' || l.type === 'ST') {
		const stop = {
			type: 'stop',
			id: res.id,
			name: l.name || id.O ? profile.parseStationName(ctx, l.name || id.O) : null,
			location: 'number' === typeof res.latitude ? res : null
		}

		if (opt.linesOfStops && Array.isArray(l.productAtStop)) {
			stop.lines = l.productAtStop.map(p => profile.parseLine(ctx, {
				...p, prodCtx: {...p, ...p.prodCtx}
			}))
		}

		if (l.hasMainMast) {
			stop.station = parseLocation(ctx, {
				type: 'ST',
				id: l.mainMastId,
				extId: l.mainMastExtId
			})
			stop.station.type = 'station'
		}

		return stop
	}

	if (l.type === 'A' || l.type === 'ADR') res.address = l.name
	else res.name = l.name
	if (l.type === 'P') res.poi = true

	return res
}

module.exports = parseLocation
