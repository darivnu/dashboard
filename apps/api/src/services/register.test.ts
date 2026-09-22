import { beforeEach, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { devOnlyServices, services } from './definitions'
import { registerServices } from './register'
import { __resetRegistryForTests, registry } from './registry'

const ids = (defs: { id: string }[]) => defs.map((def) => def.id)
const registered = () => ids(registry.listServices())

beforeEach(() => {
    __resetRegistryForTests()
})

describe('registerServices', () => {
    test('the mock services are listed as dev-only, not as regular services', () => {
        expect(ids(devOnlyServices)).toEqual(['mock', 'mock_key'])
        expect(ids(services)).not.toContain('mock')
        expect(ids(services)).not.toContain('mock_key')
    })

    test('in production only `services` are registered', () => {
        registerServices('production')

        expect(registered()).toEqual(ids(services))
        expect(registered()).not.toContain('mock')
        expect(registered()).not.toContain('mock_key')
    })

    test.each(['development', 'test', 'staging', ''])('with NODE_ENV=%j dev-only services are registered too', (nodeEnv) => {
        registerServices(nodeEnv)

        expect(registered()).toEqual([...ids(services), ...ids(devOnlyServices)])
        expect(registry.getWidget('mock', 'echo')).toBeDefined()
        expect(registry.getWidget('mock_key', 'secret_echo')).toBeDefined()
    })

    test('calling it twice trips the registry duplicate guard', () => {
        registerServices('development')

        expect(() => registerServices('development')).toThrow(/already registered/)
    })
})

/** Source with block and line comments removed, so prose mentioning a call does not count. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .filter((entry) => !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.fakes.ts'))
        .map((entry) => join(entry.parentPath, entry.name))
}

test('registerServices() is the only non-test caller of registry.register()', () => {
    const src = join(import.meta.dir, '..')
    const callers = sourceFiles(src)
        .filter((file) => /registry\.register\(/.test(stripComments(readFileSync(file, 'utf8'))))
        .map((file) => relative(src, file))

    expect(callers).toEqual(['services/register.ts'])
})
