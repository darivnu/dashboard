import { expect, test } from 'vitest'
import { parseStationMap } from './parse'

const station = {
    id: 'abc',
    name: 'Radio One',
    streamUrl: 'https://example.com/stream',
    favicon: 'https://example.com/icon.png',
    hls: false,
    lat: 48.85,
    lng: 2.35,
}

test('accepts a list of stations', () => {
    const second = { ...station, id: 'def', favicon: null, hls: true }
    expect(parseStationMap({ stations: [station, second] })).toEqual({
        stations: [station, second],
    })
})

test('accepts an empty list', () => {
    expect(parseStationMap({ stations: [] })).toEqual({ stations: [] })
})

test('accepts a station with an empty name and coordinates on the limits', () => {
    const edge = { ...station, name: '', lat: -90, lng: 180 }
    expect(parseStationMap({ stations: [edge] })).toEqual({ stations: [edge] })
})

test('keeps only the fields it knows', () => {
    const [parsed] = parseStationMap({
        stations: [{ ...station, country: 'France', votes: 10 }],
    }).stations
    expect(parsed).toEqual(station)
})

test.each([
    ['null', null],
    ['a string', 'stations'],
    ['an object without stations', { items: [] }],
    ['stations that is not a list', { stations: 'many' }],
])('refuses %s', (_name, raw) => {
    expect(() => parseStationMap(raw)).toThrow('Unexpected station map data')
})

test.each([
    ['a station that is not an object', 'radio'],
    ['a missing id', { ...station, id: undefined }],
    ['an empty id', { ...station, id: '' }],
    ['a name that is not text', { ...station, name: 5 }],
    ['an empty stream url', { ...station, streamUrl: '' }],
    ['a favicon that is a number', { ...station, favicon: 1 }],
    ['a missing favicon', { ...station, favicon: undefined }],
    ['hls that is not a boolean', { ...station, hls: 1 }],
    ['a latitude that is text', { ...station, lat: '48' }],
    ['a latitude out of range', { ...station, lat: 91 }],
    ['a longitude out of range', { ...station, lng: -181 }],
    ['a longitude that is not a number', { ...station, lng: Number.NaN }],
])('refuses a list containing %s', (_name, bad) => {
    expect(() => parseStationMap({ stations: [station, bad] })).toThrow(
        'Unexpected station map data',
    )
})
