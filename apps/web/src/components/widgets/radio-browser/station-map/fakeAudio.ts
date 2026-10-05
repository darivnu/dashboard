import { vi } from 'vitest'

// A stand-in for the browser's Audio in tests: it plays nothing, records what
// was asked of it, and lets a test fire the events a real stream would.
export class FakeAudio extends EventTarget {
    static instances: FakeAudio[] = []

    volume = 1
    muted = false
    paused = true
    play = vi.fn(() => {
        this.paused = false
        this.dispatchEvent(new Event('loadstart'))
        return Promise.resolve()
    })
    pause = vi.fn(() => {
        this.paused = true
    })
    load = vi.fn()

    private source: string | null = null

    constructor() {
        super()
        FakeAudio.instances.push(this)
    }

    get src() {
        return this.source ?? ''
    }

    set src(value: string) {
        this.source = value
    }

    getAttribute(name: string) {
        return name === 'src' ? this.source : null
    }

    removeAttribute(name: string) {
        if (name === 'src') this.source = null
    }

    /** Fire a media event, as the browser would. */
    emit(type: 'playing' | 'waiting' | 'error' | 'ended') {
        this.dispatchEvent(new Event(type))
    }

    static get last() {
        const last = FakeAudio.instances.at(-1)
        if (!last) throw new Error('no audio element was created')
        return last
    }

    static install() {
        FakeAudio.instances = []
        vi.stubGlobal('Audio', FakeAudio)
    }
}
