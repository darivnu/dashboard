import '../config/env.fakes'
import { describe, expect, test } from 'bun:test'
import type { SmtpTransport } from './mailer'

// The module picks the singleton from env while loading; import it after the fake env is in place.
const { ConsoleMailer, SmtpMailer, createMailer } = await import('./mailer')

const FROM = 'Dashboard <hello@example.com>'
const MAIL = { to: 'alice@example.com', subject: 'Verify your email', text: 'Open this link' }

describe('SmtpMailer', () => {
    test('passes from, to, subject and text to the transport', async () => {
        const calls: unknown[] = []
        const transport: SmtpTransport = {
            async sendMail(mail) {
                calls.push(mail)
                return { messageId: 'fake' }
            },
        }

        await new SmtpMailer(transport, FROM).send(MAIL)

        expect(calls).toEqual([{ from: FROM, ...MAIL }])
    })

    test('propagates a transport rejection', async () => {
        const transport: SmtpTransport = {
            async sendMail() {
                throw new Error('535 Authentication failed')
            },
        }

        await expect(new SmtpMailer(transport, FROM).send(MAIL)).rejects.toThrow('535 Authentication failed')
    })
})

describe('createMailer', () => {
    test('returns a ConsoleMailer without SMTP config', () => {
        expect(createMailer(null)).toBeInstanceOf(ConsoleMailer)
    })

    test('returns an SmtpMailer with SMTP config, without opening a connection', () => {
        const mailer = createMailer({
            host: 'smtp.example.com',
            port: 587,
            user: 'login',
            pass: 'secret',
            from: FROM,
        })

        expect(mailer).toBeInstanceOf(SmtpMailer)
    })
})
