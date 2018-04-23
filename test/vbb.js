'use strict'

const stations = require('vbb-stations-autocomplete')
const a = require('assert')
const shorten = require('vbb-short-station-name')
const tapePromise = require('tape-promise').default
const tape = require('tape')
const isRoughlyEqual = require('is-roughly-equal')

const {createWhen} = require('./lib/util')
const co = require('./lib/co')
const createClient = require('..')
const vbbProfile = require('../p/vbb')
const products = require('../p/vbb/products')
const {
	station: createValidateStation,
	line: createValidateLine,
	journeyLeg: createValidateJourneyLeg,
	departure: createValidateDeparture,
	movement: _validateMovement
} = require('./lib/validators')
const createValidate = require('./lib/validate-fptf-with')
const testJourneysStationToStation = require('./lib/journeys-station-to-station')

const when = createWhen('Europe/Berlin', 'de-DE')

const cfg = {
	when,
	stationCoordsOptional: false,
	products
}

const validateDirection = (dir, name) => {
	if (!stations(dir, true, false)[0]) {
		console.error(name + `: station "${dir}" is unknown`)
	}
}

// todo: coordsOptional = false
const _validateStation = createValidateStation(cfg)
const validateStation = (validate, s, name) => {
	_validateStation(validate, s, name)
	a.equal(s.name, shorten(s.name), name + '.name must be shortened')
}

const _validateLine = createValidateLine(cfg)
const validateLine = (validate, l, name) => {
	_validateLine(validate, l, name)
	if (l.symbol !== null) {
		a.strictEqual(typeof l.symbol, 'string', name + '.symbol must be a string')
		a.ok(l.symbol, name + '.symbol must not be empty')
	}
	if (l.nr !== null) {
		a.strictEqual(typeof l.nr, 'number', name + '.nr must be a string')
		a.ok(l.nr, name + '.nr must not be empty')
	}
	if (l.metro !== null) {
		a.strictEqual(typeof l.metro, 'boolean', name + '.metro must be a boolean')
	}
	if (l.express !== null) {
		a.strictEqual(typeof l.express, 'boolean', name + '.express must be a boolean')
	}
	if (l.night !== null) {
		a.strictEqual(typeof l.night, 'boolean', name + '.night must be a boolean')
	}
}

const _validateJourneyLeg = createValidateJourneyLeg(cfg)
const validateJourneyLeg = (validate, l, name) => {
	_validateJourneyLeg(validate, l, name)
	if (l.mode !== 'walking') {
		validateDirection(l.direction, name + '.direction')
	}
}

const _validateDeparture = createValidateDeparture(cfg)
const validateDeparture = (validate, dep, name) => {
	_validateDeparture(validate, dep, name)
	validateDirection(dep.direction, name + '.direction')
}

const validateMovement = (validate, m, name) => {
	_validateMovement(validate, m, name)
	validateDirection(m.direction, name + '.direction')
}

const validate = createValidate(cfg, {
	station: validateStation,
	line: validateLine,
	journeyLeg: validateJourneyLeg,
	departure: validateDeparture,
	movement: validateMovement
})

const test = tapePromise(tape)
const client = createClient(vbbProfile)

const amrumerStr = '900000009101'
const spichernstr = '900000042101'
const bismarckstr = '900000024201'
const atze = '900980720'
const westhafen = '900000001201'
const wedding = '900000009104'
const württembergallee = '900000026153'
const berlinerStr = '900000044201'
const landhausstr = '900000043252'

test('journeys – Spichernstr. to Bismarckstr.', co(function* (t) {
	const journeys = yield client.journeys(spichernstr, bismarckstr, {
		results: 3, when, passedStations: true
	})

	yield testJourneysStationToStation({
		test: t,
		journeys,
		validate,
		fromId: spichernstr,
		toId: bismarckstr
	})
	// todo: find a journey where there ticket info is always available

	t.end()
}))

test('journeys – only subway', co(function* (t) {
	const journeys = yield client.journeys(spichernstr, bismarckstr, {
		results: 20, when,
		products: {
			suburban: false,
			subway:   true,
			tram:     false,
			bus:      false,
			ferry:    false,
			express:  false,
			regional: false
		}
	})

	validate(t, journeys, 'journeys', 'journeys')
	t.ok(journeys.length > 1)
	for (let i = 0; i < journeys.length; i++) {
		const journey = journeys[i]
		for (let j = 0; j < journey.legs.length; j++) {
			const leg = journey.legs[j]

			const name = `journeys[${i}].legs[${i}].line`
			if (leg.line) {
				t.equal(leg.line.mode, 'train', name + '.mode is invalid')
				t.equal(leg.line.product, 'subway', name + '.product is invalid')
			}
			t.ok(journey.legs.some(l => l.line), name + '.legs has no subway leg')
		}
	}

	t.end()
}))

test('journeys – fails with no product', (t) => {
	// todo: make this test work
	// t.plan(1)
	try {
		client.journeys(spichernstr, bismarckstr, {
			when,
			products: {
				suburban: false,
				subway:   false,
				tram:     false,
				bus:      false,
				ferry:    false,
				express:  false,
				regional: false
			}
		})
		// silence rejections, we're only interested in exceptions
		.catch(() => {})
	} catch (err) {
		t.ok(err, 'error thrown')
	}
	t.end()
})

test('earlier/later journeys', co(function* (t) {
	const model = yield client.journeys(spichernstr, bismarckstr, {
		results: 3, when
	})

	// todo: move to journeys validator?
	t.equal(typeof model.earlierRef, 'string')
	t.ok(model.earlierRef)
	t.equal(typeof model.laterRef, 'string')
	t.ok(model.laterRef)

	// when and earlierThan/laterThan should be mutually exclusive
	t.throws(() => {
		client.journeys(spichernstr, bismarckstr, {
			when, earlierThan: model.earlierRef
		})
		// silence rejections, we're only interested in exceptions
		.catch(() => {})
	})
	t.throws(() => {
		client.journeys(spichernstr, bismarckstr, {
			when, laterThan: model.laterRef
		})
		// silence rejections, we're only interested in exceptions
		.catch(() => {})
	})

	let earliestDep = Infinity, latestDep = -Infinity
	for (let j of model) {
		const dep = +new Date(j.legs[0].departure)
		if (dep < earliestDep) earliestDep = dep
		else if (dep > latestDep) latestDep = dep
	}

	const earlier = yield client.journeys(spichernstr, bismarckstr, {
		results: 3,
		// todo: single journey ref?
		earlierThan: model.earlierRef
	})
	for (let j of earlier) {
		t.ok(new Date(j.legs[0].departure) < earliestDep)
	}

	const later = yield client.journeys(spichernstr, bismarckstr, {
		results: 3,
		// todo: single journey ref?
		laterThan: model.laterRef
	})
	for (let j of later) {
		t.ok(new Date(j.legs[0].departure) > latestDep)
	}

	t.end()
}))

test('journey leg details', co(function* (t) {
	const journeys = yield client.journeys(spichernstr, amrumerStr, {
		results: 1, when
	})

	const p = journeys[0].legs[0]
	t.ok(p.id, 'precondition failed')
	t.ok(p.line.name, 'precondition failed')
	const leg = yield client.journeyLeg(p.id, p.line.name, {when})

	validate(t, leg, 'journeyLeg', 'leg')
	t.end()
}))

test('journeys – station to address', co(function* (t) {
	const latitude = 52.541797
	const longitude = 13.350042
	const journeys = yield client.journeys(spichernstr, {
		type: 'location',
		address: 'Torfstr. 17, Berlin',
		latitude, longitude
	}, {results: 1, when})

	validate(t, journeys, 'journeys', 'journeys')

	const i = journeys[0].legs.length - 1
	const d = journeys[0].legs[i].destination
	const name = `journeys[0].legs[${i}].destination`

	t.strictEqual(d.address, '13353 Berlin-Wedding, Torfstr. 17', name + '.address is invalid')
	t.ok(isRoughlyEqual(.0001, d.latitude, latitude), name + '.latitude is invalid')
	t.ok(isRoughlyEqual(.0001, d.longitude, longitude), name + '.longitude is invalid')

	t.end()
}))

test('journeys – station to POI', co(function* (t) {
	const latitude = 52.543333
	const longitude = 13.351686
	const journeys = yield client.journeys(spichernstr, {
		type: 'location',
		id: atze,
		name: 'Berlin, Atze Musiktheater für Kinder',
		latitude, longitude
	}, {results: 1, when})

	validate(t, journeys, 'journeys', 'journeys')

	const i = journeys[0].legs.length - 1
	const d = journeys[0].legs[i].destination
	const name = `journeys[0].legs[${i}].destination`

	t.strictEqual(d.id, atze, name + '.id is invalid')
	t.strictEqual(d.name, 'Berlin, Atze Musiktheater für Kinder', name + '.name is invalid')
	t.ok(isRoughlyEqual(.0001, d.latitude, latitude), name + '.latitude is invalid')
	t.ok(isRoughlyEqual(.0001, d.longitude, longitude), name + '.longitude is invalid')

	t.end()
}))

test('journeys: via works – with detour', co(function* (t) {
	// Going from Westhafen to Wedding via Württembergalle without detour
	// is currently impossible. We check if the routing engine computes a detour.
	const journeys = yield client.journeys(westhafen, wedding, {
		via: württembergallee,
		results: 1,
		when,
		passedStations: true
	})

	validate(t, journeys, 'journeys', 'journeys')

	const leg = journeys[0].legs.some((leg) => {
		return leg.passed && leg.passed.some((passed) => {
			return passed.station.id === württembergallee
		})
	})
	t.ok(leg, 'Württembergalle is not being passed')

	t.end()
}))

test('departures', co(function* (t) {
	const deps = yield client.departures(spichernstr, {duration: 5, when})

	validate(t, deps, 'departures', 'departures')
	for (let i = 0; i < deps.length; i++) {
		const dep = deps[i]
		const name = `deps[${i}]`

		t.equal(dep.station.name, 'U Spichernstr.', name + '.station.name is invalid')
		t.equal(dep.station.id, spichernstr, name + '.station.id is invalid')
	}
	// todo: move into deps validator
	t.deepEqual(deps, deps.sort((a, b) => t.when > b.when))

	t.end()
}))

test('departures with station object', co(function* (t) {
	const deps = yield client.departures({
		type: 'station',
		id: spichernstr,
		name: 'U Spichernstr',
		location: {
			type: 'location',
			latitude: 1.23,
			longitude: 2.34
		}
	}, {when})

	validate(t, deps, 'departures', 'departures')
	t.end()
}))

test('departures at 7-digit station', co(function* (t) {
	const eisenach = '8010097' // see derhuerst/vbb-hafas#22
	yield client.departures(eisenach, {when})
	t.pass('did not fail')
	t.end()
}))

test('nearby', co(function* (t) {
	// Berliner Str./Bundesallee
	const nearby = yield client.nearby({
		type: 'location',
		latitude: 52.4873452,
		longitude: 13.3310411
	}, {distance: 200})

	validate(t, nearby, 'locations', 'nearby')

	t.equal(nearby[0].id, berlinerStr)
	t.equal(nearby[0].name, 'U Berliner Str.')
	t.ok(nearby[0].distance > 0)
	t.ok(nearby[0].distance < 100)

	t.equal(nearby[1].id, landhausstr)
	t.equal(nearby[1].name, 'Landhausstr.')
	t.ok(nearby[1].distance > 100)
	t.ok(nearby[1].distance < 200)

	t.end()
}))

test('locations', co(function* (t) {
	const locations = yield client.locations('Alexanderplatz', {results: 20})

	validate(t, locations, 'locations', 'locations')
	t.ok(locations.length <= 20)

	t.ok(locations.find(s => s.type === 'station'))
	t.ok(locations.find(s => s.id && s.name)) // POIs
	t.ok(locations.find(s => !s.name && s.address)) // addresses

	t.end()
}))

test('location', co(function* (t) {
	const s = yield client.location(spichernstr)

	validate(t, s, 'station', 'station')
	t.equal(s.id, spichernstr)

	t.end()
}))

test('radar', co(function* (t) {
	const vehicles = yield client.radar({
		north: 52.52411,
		west: 13.41002,
		south: 52.51942,
		east: 13.41709
	}, {
		duration: 5 * 60, when
	})

	validate(t, vehicles, 'movements', 'vehicles')
	t.end()
}))
