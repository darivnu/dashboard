import { env, isProd } from './config/env'
import { app } from './app'

if (isProd && env.smtp === null) {
    console.warn('SMTP is not configured: emails are printed to the logs, not sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM.')
}

app.listen(env.port)

console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`)