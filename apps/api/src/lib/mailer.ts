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

export const mailer: Mailer = new ConsoleMailer()