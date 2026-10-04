import { describe, expect, test } from 'vitest'
import { playableStations, supportsNativeHls } from './hls'
import type { Station } from './parse'

function station(id: string, hls: boolean): Station {
    return {
        id,
        name: id,
        streamUrl: `https://example.com/${id}`,
        favicon: null,
        hls,
        lat: 0,
        lng: 0,
    }
}

describe('supportsNativeHls', () => {
    test.each([
        ['probably', true],
        ['maybe', true],
        ['', false],
    ] as const)('canPlayType answering "%s" means %s', (answer, expected) => {
        const asked: string[] = []
        const audio = {
            canPlayType: (type: string) => {
                asked.push(type)
                return answer
            },
        }
        expect(supportsNativeHls(audio)).toBe(expected)
        expect(asked).toEqual(['application/vnd.apple.mpegurl'])
    })

    test('asks a real audio element when none is given', () => {
        expect(typeof supportsNativeHls()).toBe('boolean')
    })
})

describe('playableStations', () => {
    const stations = [
        station('a', false),
        station('b', true),
        station('c', false),
    ]

    test('keeps every station where HLS plays natively', () => {
        expect(playableStations(stations, true)).toEqual(stations)
    })

    test('leaves the HLS stations out elsewhere', () => {
        expect(
            playableStations(stations, false).map((item) => item.id),
        ).toEqual(['a', 'c'])
    })
})
