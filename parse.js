'use strict'

const moment = require('moment-timezone')
const slugg = require('slugg')



const dateTime = (tz, date, time) => {
	let offset = 0 // in days
	if (time.length > 6) {
		offset = +time.slice(0, -6)
		time = time.slice(-6)
	}
	return moment.tz(date + 'T' + time, tz)
	.add(offset, 'days')
}



const types = {P: 'poi', S: 'station', A: 'address'}
// todo: what is s.rRefL?
const location = (l) => {
	const type = types[l.type] || 'unknown'
	const result = {
		type,
		name: l.name,
		coordinates: l.crd ? {
			latitude: l.crd.y / 1000000,
			longitude: l.crd.x / 1000000
		} : null
	}
	if (type === 'poi' || type === 'station') result.id = l.extId
	if ('pCls' in l) result.products = l.pCls
	return result
}



// todo: what is p.number vs p.line?
// todo: what is p.icoX?
// todo: what is p.oprX?
const line = (p) => {
	if (!p) return null
	const result = {type: 'line', name: p.line || p.name}
	if (p.cls) result.class = p.cls
	if (p.prodCtx) {
		result.productCode = +p.prodCtx.catCode
		result.productName = p.prodCtx.catOutS
	}
	return result
}



const remark = (r) => null // todo



const operator = (a) => ({
	type: 'operator',
	id: slugg(a.name),
	name: a.name
})



// s = stations, ln = lines, r = remarks, c = connection
const stopover = (tz, s, ln, r, c) => (st) => {
	const result = {station: s[parseInt(st.locX)]}
	if (st.aTimeR || st.aTimeS) {
		result.arrival = dateTime(tz, c.date, st.aTimeR || st.aTimeS).format()
	}
	if (st.dTimeR || st.dTimeS) {
		result.departure = dateTime(tz, c.date, st.dTimeR || st.dTimeS).format()
	}
	return result
}

// todo: finish parseRemark first
// s = stations, ln = lines, r = remarks, c = connection
const applyRemark = (s, ln, r, c) => (rm) => null

// todo: pt.sDays
// todo: pt.dep.dProgType, pt.arr.dProgType
// todo: what is pt.jny.dirFlg?
// todo: how does pt.freq work?
// tz = timezone, s = stations, ln = lines, r = remarks, c = connection
const part = (tz, s, ln, r, c) => (pt) => {
	const result = {
		  origin: Object.assign({}, s[parseInt(pt.dep.locX)])
		, destination: Object.assign({}, s[parseInt(pt.arr.locX)])
		, departure: dateTime(tz, c.date, pt.dep.dTimeR || pt.dep.dTimeS).format()
		, arrival: dateTime(tz, c.date, pt.arr.aTimeR || pt.arr.aTimeS).format()
	}
	if (pt.dep.dTimeR && pt.dep.dTimeS) {
		const realtime = dateTime(tz, c.date, pt.dep.dTimeR)
		const planned = dateTime(tz, c.date, pt.dep.dTimeS)
		result.delay = Math.round((realtime - planned) / 1000)
	}

	if (pt.type === 'WALK') result.mode = 'walking'
	else if (pt.type === 'JNY') {
		result.id = pt.jny.jid
		result.line = ln[parseInt(pt.jny.prodX)]
		result.direction = pt.jny.dirTxt // todo: parse this

		if (pt.dep.dPlatfS) result.departurePlatform = pt.dep.dPlatfS
		if (pt.arr.aPlatfS) result.arrivalPlatform = pt.arr.aPlatfS

		if (pt.jny.stopL) result.passed = pt.jny.stopL.map(stopover(tz, s, ln, r, c))
		if (Array.isArray(pt.jny.remL))
			pt.jny.remL.forEach(applyRemark(s, ln, r, c))

		if (pt.jny.freq && pt.jny.freq.jnyL)
			result.alternatives = pt.jny.freq.jnyL
				.filter((a) => a.stopL[0].locX === pt.dep.locX)
				.map((a) => ({
					line: ln[parseInt(a.prodX)],
					when: dateTime(tz, c.date, a.stopL[0].dTimeS).format()
				}))
	}
	return result
}

// todo: c.sDays
// todo: c.dep.dProgType, c.arr.dProgType
// todo: c.conSubscr
// todo: c.trfRes x vbb-parse-ticket
// todo: use computed information from part
// s = stations, ln = lines, r = remarks, p = parsePart
const journey = (tz, s, ln, r, p = part) => (c) => {
	const parts = c.secL.map(p(tz, s, ln, r, c))
	return {
		  parts
		, origin: parts[0].origin
		, destination: parts[parts.length - 1].destination
		, departure: parts[0].departure
		, arrival: parts[parts.length - 1].arrival
	}
}

// todo: what is d.jny.dirFlg?
// todo: d.stbStop.dProgType
// todo: what is d.stbStop.dTimeR?
// tz = timezone, s = stations, ln = lines, r = remarks
const departure = (tz, s, ln, r) => (d) => {
	const result = {
		  ref: d.jid
		, station: s[parseInt(d.stbStop.locX)]
		, when: dateTime(tz, d.date, d.stbStop.dTimeR || d.stbStop.dTimeS).format()
		, direction: d.dirTxt
		, line: ln[parseInt(d.prodX)]
		, remarks: d.remL ? d.remL.map((rm) => r[parseInt(rm.remX)]) : null
		, trip: +d.jid.split('|')[1]
	}
	if (d.stbStop.dTimeR && d.stbStop.dTimeS) {
		const realtime = dateTime(tz, d.date, d.stbStop.dTimeR)
		const planned = dateTime(tz, d.date, d.stbStop.dTimeS)
		result.delay = Math.round((realtime - planned) / 1000)
	} else result.delay = null
	return result
}

// todo: remarks
// todo: lines
// todo: what is s.pCls?
// todo: what is s.wt?
// todo: what is s.dur?
const nearby = (n) => {
	const result = location(n)
	result.distance = n.dist
	return result
}

// todo: what is m.dirGeo? maybe the speed?
// todo: what is m.stopL?
// todo: what is m.proc? wut?
// todo: what is m.pos?
// todo: what is m.ani.dirGeo[n]? maybe the speed?
// todo: what is m.ani.proc[n]? wut?
// todo: how does m.ani.poly work?
// tz = timezone, l = locations, ln = lines, r = remarks
const movement = (tz, l, ln, r) => (m) => {
	const result = {
		  direction: m.dirTxt
		, line: ln[m.prodX]
		, coordinates: m.pos ? {
			latitude: m.pos.y / 1000000,
			longitude: m.pos.x / 1000000
		} : null
		, nextStops: m.stopL.map((s) => ({
			  station:   l[s.locX]
			, departure: s.dTimeR || s.dTimeS
				? dateTime(tz, m.date, s.dTimeR || s.dTimeS).format()
				: null
			, arrival: s.aTimeR || s.aTimeS
				? dateTime(tz, m.date, s.aTimeR || s.aTimeS).format()
				: null
		}))
		, frames: []
	}
	if (m.ani && Array.isArray(m.ani.mSec))
		for (let i = 0; i < m.ani.mSec.length; i++)
			result.frames.push({
				origin: l[m.ani.fLocX[i]],
				destination: l[m.ani.tLocX[i]],
				t: m.ani.mSec[i]
			})
	return result
}



module.exports = {
	dateTime,
	location, line, remark, operator,
	stopover, applyRemark, part, journey,
	departure,
	nearby,
	movement
}
