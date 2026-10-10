import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
    cleanup()
})

// jsdom does not implement the modal half of <dialog>. These stand-ins do
// what the components rely on: the `open` attribute and the `close` event.
if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '')
    }
}
if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
        if (!this.hasAttribute('open')) return
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
    }
}

// jsdom has no matchMedia. By default no query matches, so the dashboard
// renders its narrow-screen layout; a test that needs the wide one stubs
// matchMedia itself.
if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
        ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }) as unknown as MediaQueryList
}
