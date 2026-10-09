import { expect, test } from 'vitest'
import { parseFact } from './parse'

test('accepts a well-formed fact', () => {
    expect(
        parseFact({
            text: 'Honey never spoils.',
            source: 'djtech.net',
            sourceUrl: 'http://example.com',
        }),
    ).toEqual({
        text: 'Honey never spoils.',
        source: 'djtech.net',
        sourceUrl: 'http://example.com',
    })
})

test('turns a missing source and sourceUrl into null', () => {
    expect(parseFact({ text: 'A fact with no attribution' })).toEqual({
        text: 'A fact with no attribution',
        source: null,
        sourceUrl: null,
    })
})

test.each([
    ['null', null],
    ['a string', 'hi'],
    ['a list', ['hi']],
    ['an object without text', { source: 'x' }],
    ['a text that is not text', { text: 5 }],
])('refuses %s', (_name, raw) => {
    expect(() => parseFact(raw)).toThrow('Unexpected fact data')
})
