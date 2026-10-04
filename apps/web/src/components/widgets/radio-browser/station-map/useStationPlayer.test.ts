import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FakeAudio } from './fakeAudio'
import type { Station } from './parse'
import { useStationPlayer } from './useStationPlayer'

function station(id: string): Station {
    return {
        id,
        name: `Radio ${id}`,
        streamUrl: `https://example.com/${id}`,
        favicon: null,
        hls: false,
        lat: 0,
        lng: 0,
    }
}

const one = station('one')
const two = station('two')

beforeEach(() => {
    vi.useFakeTimers()
    FakeAudio.install()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function setup() {
    const view = renderHook(() => useStationPlayer())
    return { ...view, audio: FakeAudio.last }
}

test('starts idle with no station, at full volume', () => {
    const { result } = setup()
    expect(result.current).toMatchObject({
        station: null,
        status: 'idle',
        volume: 1,
        muted: false,
    })
})

describe('playing a station', () => {
    test('connects at once, then plays when sound starts', () => {
        const { result, audio } = setup()

        act(() => result.current.play(one))
        expect(result.current.station).toEqual(one)
        expect(result.current.status).toBe('connecting')
        expect(audio.src).toBe('https://example.com/one')
        expect(audio.play).toHaveBeenCalledTimes(1)

        act(() => audio.emit('playing'))
        expect(result.current.status).toBe('playing')
    })

    test('another station replaces the one playing', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('playing'))

        act(() => result.current.play(two))
        expect(result.current.station).toEqual(two)
        expect(result.current.status).toBe('connecting')
        expect(audio.src).toBe('https://example.com/two')
        expect(FakeAudio.instances).toHaveLength(1)
    })
})

describe('a station that is not available', () => {
    test('a stream error is reported as failed and the stream is dropped', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))

        act(() => audio.emit('error'))
        expect(result.current.status).toBe('failed')
        expect(result.current.station).toEqual(one)
        expect(audio.src).toBe('')
    })

    test('no sound within 10 seconds is reported as failed', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))

        act(() => vi.advanceTimersByTime(9_999))
        expect(result.current.status).toBe('connecting')

        act(() => vi.advanceTimersByTime(1))
        expect(result.current.status).toBe('failed')
        expect(audio.src).toBe('')
    })

    test('sound starting in time cancels the timeout', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => vi.advanceTimersByTime(9_000))
        act(() => audio.emit('playing'))

        act(() => vi.advanceTimersByTime(60_000))
        expect(result.current.status).toBe('playing')
    })

    test('another station can be played straight away', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('error'))

        act(() => result.current.play(two))
        expect(result.current.status).toBe('connecting')
        act(() => audio.emit('playing'))
        expect(result.current).toMatchObject({
            station: two,
            status: 'playing',
        })
    })

    test('a stream that stalls while playing gets 10 seconds to come back', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('playing'))

        act(() => audio.emit('waiting'))
        expect(result.current.status).toBe('connecting')
        act(() => vi.advanceTimersByTime(10_000))
        expect(result.current.status).toBe('failed')
    })

    test('a stream that ends is reported as failed', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('playing'))
        act(() => audio.emit('ended'))
        expect(result.current.status).toBe('failed')
    })
})

describe('pause and resume', () => {
    test('toggle pauses a playing station and drops the stream', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('playing'))

        act(() => result.current.toggle())
        expect(result.current.status).toBe('paused')
        expect(result.current.station).toEqual(one)
        expect(audio.pause).toHaveBeenCalled()
        expect(audio.src).toBe('')

        // the error some browsers fire for a dropped source is not a failure
        act(() => audio.emit('error'))
        expect(result.current.status).toBe('paused')
    })

    test('toggle again reconnects to the same station', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('playing'))
        act(() => result.current.toggle())

        act(() => result.current.toggle())
        expect(result.current.status).toBe('connecting')
        expect(audio.src).toBe('https://example.com/one')
        act(() => audio.emit('playing'))
        expect(result.current.status).toBe('playing')
    })

    test('pausing while connecting cancels the timeout', () => {
        const { result } = setup()
        act(() => result.current.play(one))
        act(() => result.current.toggle())
        act(() => vi.advanceTimersByTime(60_000))
        expect(result.current.status).toBe('paused')
    })

    test('toggle retries a failed station', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('error'))
        act(() => result.current.toggle())
        expect(result.current.status).toBe('connecting')
    })

    test('toggle does nothing when no station was chosen', () => {
        const { result, audio } = setup()
        act(() => result.current.toggle())
        expect(result.current.status).toBe('idle')
        expect(audio.play).not.toHaveBeenCalled()
    })
})

describe('volume', () => {
    test('setVolume changes the volume of the audio element', () => {
        const { result, audio } = setup()
        act(() => result.current.setVolume(0.4))
        expect(result.current.volume).toBe(0.4)
        expect(audio.volume).toBe(0.4)
    })

    test('the volume stays between 0 and 1', () => {
        const { result } = setup()
        act(() => result.current.setVolume(7))
        expect(result.current.volume).toBe(1)
        act(() => result.current.setVolume(-1))
        expect(result.current.volume).toBe(0)
    })

    test('toggleMute mutes and unmutes without changing the volume', () => {
        const { result, audio } = setup()
        act(() => result.current.setVolume(0.4))

        act(() => result.current.toggleMute())
        expect(result.current.muted).toBe(true)
        expect(audio.muted).toBe(true)
        expect(result.current.volume).toBe(0.4)

        act(() => result.current.toggleMute())
        expect(audio.muted).toBe(false)
    })
})

describe('stopping', () => {
    test('playback stops when the widget is removed', () => {
        const { result, audio, unmount } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('playing'))

        unmount()
        expect(audio.pause).toHaveBeenCalled()
        expect(audio.src).toBe('')
    })

    test('playback stops when the page is left', () => {
        const { result, audio } = setup()
        act(() => result.current.play(one))
        act(() => audio.emit('playing'))

        act(() => {
            window.dispatchEvent(new Event('pagehide'))
        })
        expect(audio.src).toBe('')
        expect(result.current.status).toBe('paused')
    })

    test('a removed widget no longer reacts to its timeout', () => {
        const { result, unmount } = setup()
        act(() => result.current.play(one))
        unmount()
        expect(() => vi.advanceTimersByTime(60_000)).not.toThrow()
    })
})

test('two widgets have their own audio, station and volume', () => {
    const first = setup()
    const second = setup()
    expect(first.audio).not.toBe(second.audio)

    act(() => first.result.current.play(one))
    act(() => second.result.current.play(two))
    act(() => first.audio.emit('playing'))
    act(() => second.result.current.setVolume(0.2))

    expect(first.result.current).toMatchObject({
        station: one,
        status: 'playing',
        volume: 1,
    })
    expect(second.result.current).toMatchObject({
        station: two,
        status: 'connecting',
        volume: 0.2,
    })
    expect(first.audio.src).toBe('https://example.com/one')
    expect(second.audio.src).toBe('https://example.com/two')
})
