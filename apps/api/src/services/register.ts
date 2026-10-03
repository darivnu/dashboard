import { devOnlyServices, services } from './definitions'
import { registry } from './registry'

/**
 * Fills the registry at boot. The only production caller of
 * `registry.register()` — service files export definitions, this decides.
 *
 * `nodeEnv` is passed in (app.ts hands over `env.nodeEnv`) instead of read
 * here so tests can call `registerServices('production')` without importing
 * config/env.ts, which throws when DATABASE_URL / APP_URL are missing.
 *
 * Only the exact string 'production' hides `devOnlyServices`: 'development',
 * 'test', 'staging' or an unset variable all get the mocks, so a misspelled
 * NODE_ENV can never leak a dev-only service INTO production.
 */
export function registerServices(nodeEnv: string): void {
    for (const service of services) {
        registry.register(service)
    }

    if (nodeEnv === 'production') return

    for (const service of devOnlyServices) {
        registry.register(service)
    }
}