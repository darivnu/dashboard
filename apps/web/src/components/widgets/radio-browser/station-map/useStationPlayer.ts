import { useEffect, useRef, useState } from 'react'
import type { Station } from './parse'

export type PlayerStatus =
    | 'idle'
    | 'connecting'
    | 'playing'
    | 'paused'
    | 'failed'

/** How long a stream may stay silent before it is reported as unavailable. */
export const CONNECT_TIMEOUT_MS = 10_000

// Pausing alone would keep downloading a live stream; dropping the source
// closes the connection.
function stopLoading(audio: HTMLAudioElement) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
}

export function useStationPlayer() {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    )
    const [station, setStation] = useState<Station | null>(null)
    const [status, setStatus] = useState<PlayerStatus>('idle')
    const [volume, setVolumeState] = useState(1)
    const [muted, setMuted] = useState(false)

    // One audio element for the life of this widget.
    useEffect(() => {
        const audio = new Audio()
        audioRef.current = audio

        const fail = () => {
            clearTimeout(timerRef.current)
            stopLoading(audio)
            setStatus('failed')
        }
        // The stream is (re)connecting: it has 10 seconds to produce sound.
        const onConnecting = () => {
            clearTimeout(timerRef.current)
            timerRef.current = setTimeout(fail, CONNECT_TIMEOUT_MS)
            setStatus('connecting')
        }
        const onPlaying = () => {
            clearTimeout(timerRef.current)
            setStatus('playing')
        }
        const onError = () => {
            // Dropping the source on purpose is not a failure.
            if (audio.getAttribute('src')) fail()
        }
        const stop = () => {
            clearTimeout(timerRef.current)
            stopLoading(audio)
            setStatus((current) => (current === 'idle' ? 'idle' : 'paused'))
        }

        audio.addEventListener('loadstart', onConnecting)
        audio.addEventListener('waiting', onConnecting)
        audio.addEventListener('playing', onPlaying)
        audio.addEventListener('error', onError)
        audio.addEventListener('ended', onError)
        window.addEventListener('pagehide', stop)

        return () => {
            audio.removeEventListener('loadstart', onConnecting)
            audio.removeEventListener('waiting', onConnecting)
            audio.removeEventListener('playing', onPlaying)
            audio.removeEventListener('error', onError)
            audio.removeEventListener('ended', onError)
            window.removeEventListener('pagehide', stop)
            clearTimeout(timerRef.current)
            stopLoading(audio)
            audioRef.current = null
        }
    }, [])

    // Keep the element in step with the volume controls.
    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.volume = volume
        audio.muted = muted
    }, [volume, muted])

    const play = (next: Station) => {
        const audio = audioRef.current
        if (!audio) return
        setStation(next)
        setStatus('connecting')
        audio.src = next.streamUrl
        // A rejection is reported by the error event or the timeout; the one
        // from being replaced by another station is expected.
        audio.play().catch(() => {})
    }

    const pause = () => {
        const audio = audioRef.current
        if (!audio) return
        clearTimeout(timerRef.current)
        stopLoading(audio)
        setStatus('paused')
    }

    const toggle = () => {
        if (status === 'playing' || status === 'connecting') pause()
        else if (station) play(station)
    }

    const setVolume = (value: number) => {
        setVolumeState(Math.min(1, Math.max(0, value)))
    }

    const toggleMute = () => setMuted((current) => !current)

    return {
        station,
        status,
        volume,
        muted,
        play,
        toggle,
        setVolume,
        toggleMute,
    }
}

export type StationPlayer = ReturnType<typeof useStationPlayer>
