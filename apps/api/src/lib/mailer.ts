import { createTransport } from 'nodemailer'
import { env, type SmtpConfig } from '../config/env'

export interface Mail {
    to: string
    subject: string
    text: string
}

export interface Mailer {
    send(mail: Mail): Promise<void>
}

export class ConsoleMailer implements Mailer {
    async send(mail: Mail): Promise<void> {
      console.log(
        [
          '',
          '========== MAIL ==========',
          `To:      ${mail.to}`,
          `Subject: ${mail.subject}`,
          '',
          mail.text,
          '==========================',
          '',
        ].join('\n'),
      )
    }
}

/** The one nodemailer method this module uses. Tests inject a fake. */
export interface SmtpTransport {
    sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<unknown>
}

export class SmtpMailer implements Mailer {
    constructor(
        private readonly transport: SmtpTransport,
        private readonly from: string,
    ) {}

    async send(mail: Mail): Promise<void> {
        await this.transport.sendMail({
            from: this.from,
            to: mail.to,
            subject: mail.subject,
            text: mail.text,
        })
    }
}

// nodemailer defaults to 2 minutes; a hung relay would hold /register that long.
const SMTP_TIMEOUT_MS = 10_000

/** Picks the implementation from the SMTP config: none means console. */
export function createMailer(smtp: SmtpConfig | null): Mailer {
    if (!smtp) return new ConsoleMailer()

    const transport = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        requireTLS: true,
        auth: { user: smtp.user, pass: smtp.pass },
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
    })

    return new SmtpMailer(transport, smtp.from)
}

export const mailer: Mailer = createMailer(env.smtp)
