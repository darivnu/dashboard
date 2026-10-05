import { expect, test } from 'vitest'
import { parseEcho } from './parse'

test('accepts the data of mock/echo', () => {
    expect(
        parseEcho({
            message: 'hi',
            count: 2,
            repeated: ['hi', 'hi'],
            timestamp: '2026-10-03T14:32:00.000Z',
        }),
    ).toEqual({ message: 'hi', count: 2 })
})

test('accepts the data of mock_key/secret_echo, which has no count', () => {
    expect(
        parseEcho({ message: 'hi', timestamp: '2026-10-03T14:32:00.000Z' }),
    ).toEqual({ message: 'hi', count: undefined })
})

test.each([
    ['null', null],
    ['a string', 'hi'],
    ['a list', ['hi']],
    ['an object without message', { count: 1 }],
    ['a message that is not text', { message: 5 }],
    ['a count that is not a number', { message: 'hi', count: 'two' }],
])('refuses %s', (_name, raw) => {
    expect(() => parseEcho(raw)).toThrow('Unexpected echo data')
})
