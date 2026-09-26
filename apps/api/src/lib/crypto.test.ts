import '../config/env.fakes'
import { expect, test } from 'bun:test'

// crypto.ts reads env while loading; import it after the fake env is in place.
const { encrypt, decrypt } = await import('./crypto')

test('decrypt(encrypt(x)) === x', () => {
    const x = 'sk_live_1234567890abcdef'

    expect(decrypt(encrypt(x))).toBe(x)
})
