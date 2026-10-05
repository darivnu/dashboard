import type { Station } from './parse'

const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl'

type CanPlay = Pick<HTMLMediaElement, 'canPlayType'>

/** Whether this browser plays HLS streams in a plain audio element. */
export function supportsNativeHls(
    audio: CanPlay = document.createElement('audio'),
) {
    return audio.canPlayType(HLS_MIME_TYPE) !== ''
}

/** The stations this browser can play: all of them, or all but the HLS ones. */
export function playableStations(stations: Station[], hlsSupported: boolean) {
    return hlsSupported ? stations : stations.filter((station) => !station.hls)
}
