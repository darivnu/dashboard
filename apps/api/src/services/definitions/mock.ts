/**
 * Mock services — the reference implementation every new service is copied from.
 *
 * A service file exports one or more `ServiceDef` objects and NOTHING else:
 * it never calls `registry.register()` (register.ts does that) and never reads
 * `NODE_ENV` (index.ts decides whether a service is dev-only by which array it
 * is listed in). Adding a service = create a file like this one, then add one
 * import line and one array entry in ./index.ts.
 *
 * Two services are defined here because `auth` is per service, and we want a
 * template for each auth kind that doesn't need an OAuth provider:
 *   - `mock`      auth.kind 'none'    → the data endpoint calls fetch() directly
 *   - `mock_key`  auth.kind 'apiKey'  → the user must subscribe with a key first;
 *                                       the data endpoint passes it as ctx.credentials
 *
 * `mock` also declares an action, `ping`: the template for anything a user
 * triggers on demand rather than a widget fetched on a timer.
 *
 * Only registered outside production (see index.ts `devOnlyServices`).
 */
import type { ParamDef, ServiceDef, WidgetFetchErrorCode, WidgetParams } from '../types'
import { WidgetFetchError } from '../types'

/**
 * The only key `secret_echo` accepts. Exported so a test or a curl session can
 * reference it instead of retyping the literal.
 */
export const MOCK_API_KEY = 'mock-secret-key'

/**
 * A widget signals failure by THROWING `WidgetFetchError(code, message)`; the
 * data endpoint (modules/dashboard/data.service.ts) turns that into
 * `{ ok: false, code }` with HTTP 200. Any other exception becomes
 * `upstream_error`. The four codes and when a real service uses them:
 *   needs_reauth    the stored credential is missing, expired or rejected (401/403)
 *   rate_limited    the upstream said 429 — the frontend backs off
 *   upstream_error  the upstream is down, timed out or returned garbage
 *   invalid_config  the stored params no longer make sense for the widget
 * `validateParams()` throws `invalid_config` for you before fetch() runs, so
 * a service rarely throws that one itself.
 */
const FAIL_CODES: readonly WidgetFetchErrorCode[] = [
    'needs_reauth',
    'rate_limited',
    'upstream_error',
    'invalid_config',
]

/**
 * Param shared by both mock widgets. Declaring it once keeps the two widgets'
 * catalog entries identical for this field.
 *
 * Param types are restricted to 'string' | 'integer' on purpose: /about.json
 * exposes `{ name, type }` for every param and those are the only two types
 * the spec allows there. The `fail` param must therefore be a string, not an
 * enum — the accepted values live in the label/description below.
 */
const failParam: ParamDef = {
    // Key under which the value is stored in widget_instances.params and
    // passed to fetch() as `params.fail`.
    name: 'fail',
    // Shown by the frontend next to the input and returned by /api/catalog.
    // /about.json does NOT include it — only name and type.
    label: 'Force an error: needs_reauth | rate_limited | upstream_error | invalid_config (anything else = succeed)',
    type: 'string',
    // Optional (the default for `required`), so an instance can be created
    // without it; fetch() then sees `params.fail === undefined`.
}

/**
 * Throws the error the caller asked for via the `fail` param. Values that are
 * not one of the four codes are ignored — "don't fail" is the safe reading of
 * a typo, and it keeps the param usable as a free-text string.
 */
function failIfRequested(params: WidgetParams): void {
    const requested = params.fail
    if (typeof requested !== 'string') return

    const code = FAIL_CODES.find((candidate) => candidate === requested)
    if (code) {
        throw new WidgetFetchError(code, `mock asked to fail with "${code}"`)
    }
}

export const mockService: ServiceDef = {
    // Stored in widget_instances.service_id and used in every API call that
    // targets this service (`POST /api/dashboard/instances { serviceId }`).
    // Renaming it orphans existing instances → data endpoint returns
    // `invalid_config` for them. Must be unique across the registry.
    id: 'mock',

    // Human-readable, shown in /about.json, /api/catalog and the frontend.
    name: 'Mock',

    // 'none' means the data endpoint calls fetch() without any credential
    // lookup. This is the only kind that works end to end today.
    auth: { kind: 'none' },

    widgets: [
        {
            // Unique within the service; stored in widget_instances.widget_id.
            id: 'echo',
            // Both appear in /about.json and the catalog; `description` is the
            // one-liner the frontend shows in the "add widget" picker.
            name: 'Echo',
            description: 'Returns the params you configured plus a timestamp',

            /**
             * Drives three things:
             *  1. /about.json  → `{ name, type }` per param
             *  2. /api/catalog → `{ name, label, type, required, default }`,
             *     plus `min` / `max` for an integer param that declares them
             *  3. validation   → buildParamSchema() turns this list into a
             *     TypeBox schema. On instance create/update, bad input is a
             *     400 INVALID_PARAMS; unknown keys are dropped, defaults are
             *     applied, numeric strings become integers. fetch() always
             *     receives the cleaned result, never raw user input.
             */
            params: [
                {
                    name: 'message',
                    label: 'Message to echo back',
                    type: 'string',
                    // required: true → instance creation fails without it.
                    required: true,
                },
                {
                    name: 'count',
                    label: 'How many times to repeat the message',
                    type: 'integer',
                    // A default makes the param optional in practice: it is
                    // filled in before fetch() runs, so `params.count` is
                    // always a number here.
                    default: 1,
                    /**
                     * Inclusive range, integer params only. Each bound is
                     * optional and enforced on its own side. Declared once
                     * here, they drive three things:
                     *  1. /api/catalog → published as `min` / `max`, so a form
                     *     can enforce the range without parsing the label
                     *  2. validation   → a value outside the range is a
                     *     400 INVALID_PARAMS on create/update, and
                     *     `invalid_config` from the data endpoint for an
                     *     instance already stored with such a value
                     *  3. the registry → rejects at boot a bound that is not
                     *     an integer, min > max, and a default outside the range
                     * So do not repeat the range in the label and do not clamp
                     * in fetch().
                     */
                    min: 1,
                    max: 10,
                },
                failParam,
            ],

            /**
             * `default` is the refresh interval (seconds) an instance gets when
             * the user does not choose one. `min` is enforced twice:
             *  - on create/update: refreshSeconds below it → 400 REFRESH_TOO_LOW
             *  - in the data endpoint: successful results are cached for `min`
             *    seconds per (service, widget, params), so no user can hit
             *    the upstream more often than that.
             * The registry rejects min < 5 and min > default at boot.
             * For a mock we want changes visible fast, so min is the floor.
             */
            refresh: { default: 60, min: 5 },

            /**
             * Called by the data endpoint with the validated params. `ctx.http`
             * is the shared HTTP client (10 s timeout, maps 429 → rate_limited,
             * 401/403 → needs_reauth, other errors → upstream_error); a real
             * service uses it instead of global fetch(). Whatever this returns
             * is sent to the frontend as `{ ok: true, data, fetchedAt }`.
             * The mock needs no network, so `ctx` is unused.
             */
            async fetch(_ctx, params) {
                failIfRequested(params)

                // After validation `message` is a string and `count` a number
                // inside its declared min/max, but WidgetParams is typed
                // `string | number`, so narrow here. No clamp needed.
                const message = String(params.message)
                const count = Number(params.count)

                return {
                    message,
                    count,
                    repeated: Array.from({ length: count }, () => message),
                    timestamp: new Date().toISOString(),
                }
            },
        },
    ],

    /**
     * Actions: what a user TRIGGERS, as opposed to a widget, which the
     * dashboard fetches on a timer. "Report a play" or "star a repository"
     * are actions. The list is optional; a service without it has none.
     *
     * No route to write: every action of every service is run by
     *   POST /api/services/:serviceId/actions/:actionId   body { params }
     * (modules/actions/). This one is POST /api/services/mock/actions/ping.
     * The catalog lists it under the service's `actions`; /about.json does not.
     *
     * What the route does, in order:
     *   1. unknown service or action          → 404 NOT_FOUND
     *   2. over `rateLimit`                   → 429 RATE_LIMITED + Retry-After
     *   3. params invalid                     → 400 INVALID_PARAMS
     *   4. service auth is not 'none'         → 200 { ok: false, code: 'needs_reauth' }
     *      (actions get no credentials yet, so run() is not called)
     *   5. run()                              → 200 { ok: true, data }
     */
    actions: [
        {
            // Unique within the service; it is the :actionId of the URL.
            id: 'ping',
            // Shown by the frontend and returned by /api/catalog.
            name: 'Ping',
            description: 'Sends a message and gets it back with a timestamp',

            /**
             * Same ParamDef shape and same validation as widget params:
             * unknown keys are dropped, defaults applied, numeric strings
             * become integers, and integer `min` / `max` are enforced. Here
             * the values come from the request body, not from a stored
             * instance, so bad input is always a 400 INVALID_PARAMS.
             */
            params: [
                {
                    name: 'message',
                    label: 'Message to send back',
                    type: 'string',
                    required: true,
                },
                failParam,
            ],

            /**
             * Optional. At most `max` calls per `windowSeconds`, counted per
             * user AND per action: one user pinging too often slows down
             * neither another user nor their own other actions. The window
             * starts at the user's first call. The call over the limit gets a
             * 429 with a Retry-After header, and run() is not called.
             *
             * Every call that reaches step 2 counts, including one whose
             * params turn out invalid. Without `rateLimit` the action is not
             * limited at all, so set one on anything that hits an upstream.
             * The registry refuses at boot a `max` or `windowSeconds` that is
             * not an integer >= 1.
             */
            rateLimit: { max: 5, windowSeconds: 60 },

            /**
             * Called with the validated params. Same rules as a widget's
             * fetch(): use `ctx.http`, never the global fetch(), and signal
             * failure by THROWING WidgetFetchError:
             *   needs_reauth | rate_limited | upstream_error → 200 { ok: false, code }
             *   invalid_config                               → 400 INVALID_PARAMS
             * Any other exception is logged and becomes `upstream_error`.
             *
             * Unlike a widget, the result is NEVER cached: two identical
             * calls run twice. Whatever this returns is sent as
             * `{ ok: true, data }`.
             */
            async run(_ctx, params) {
                failIfRequested(params)

                return {
                    message: String(params.message),
                    timestamp: new Date().toISOString(),
                }
            },
        },
    ],
}

export const mockKeyService: ServiceDef = {
    id: 'mock_key',
    name: 'Mock (API key)',

    /**
     * 'apiKey' tells the frontend to ask the user for these fields before the
     * service can be used, and tells the data endpoint that fetch() needs a
     * credential. `fields` use the same ParamDef shape as widget params (same
     * types, same validation) and appear in /api/catalog under `auth.fields`.
     * The user stores them with `POST /api/subscriptions/:service`. Without an
     * active subscription the data endpoint answers `needs_reauth` without
     * calling fetch().
     */
    auth: {
        kind: 'apiKey',
        fields: [
            {
                name: 'apiKey',
                label: `API key (the mock only accepts "${MOCK_API_KEY}")`,
                type: 'string',
                required: true,
            },
        ],
    },

    widgets: [
        {
            id: 'secret_echo',
            name: 'Secret echo',
            description: 'Echoes a message, but only with the documented mock API key',
            params: [
                {
                    name: 'message',
                    label: 'Message to echo back',
                    type: 'string',
                    required: true,
                },
                failParam,
            ],
            refresh: { default: 60, min: 5 },

            /**
             * Shows where a real apiKey service reads its credential:
             * `ctx.credentials`, keyed by the names in `auth.fields`. A real
             * service sends the key upstream and lets `ctx.http` turn a 401/403
             * into `needs_reauth`; the mock compares it locally instead.
             * Throwing `needs_reauth` makes the data endpoint flag the
             * subscription, so the user is asked for a new key.
             */
            async fetch(ctx, params) {
                failIfRequested(params)

                if (ctx.credentials?.apiKey !== MOCK_API_KEY) {
                    throw new WidgetFetchError('needs_reauth', 'mock_key: API key rejected')
                }

                return {
                    message: String(params.message),
                    timestamp: new Date().toISOString(),
                }
            },
        },
    ],
}