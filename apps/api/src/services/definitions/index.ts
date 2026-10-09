/**
 * The list of every service the API knows about. Hand-maintained: adding a
 * service = one import line here plus one entry in ONE of the two arrays.
 * register.ts is the only reader; nothing here touches the registry or the
 * environment.
 */
import type { ServiceDef } from '../types'
import { mockKeyService, mockService } from './mock'
import { radioBrowserService } from './radio-browser'
import { letterboxdService } from './letterboxd'
import { adviceService } from './advice'
import { randomFoxService } from './random_fox'
import { factsService } from './facts'
import { nasaService } from './nasa'
import { epicGamesService } from './epic-games'
import { githubService } from './github'
import { pokemonTcgService } from './pokemon-tcg'
import { spotifyService } from './spotify'

/** Registered in every environment. Real, production-ready services go here. */
export const services: ServiceDef[] = [radioBrowserService, letterboxdService, adviceService, randomFoxService, factsService, nasaService, githubService, epicGamesService, pokemonTcgService]

/**
 * Registered only when NODE_ENV !== 'production' (register.ts decides).
 * For fixtures like the mocks: they must never appear in a production
 * /about.json or catalog, and instances of them must be rejected there.
 */
export const devOnlyServices: ServiceDef[] = [mockService, mockKeyService]