import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { config } from '../config';

export interface Mail { to: string[]; subject: string; text: string; html: string; attachments?: { filename: string; content: Buffer; contentType: string }[] }

/** Pengirim email via SMTP (Gmail, Office 365, Zoho, SES, Mailgun, dll). Tanpa SMTP_HOST, fitur kirim email nonaktif. */
@Injectable()
export class MailerService {
  private log = new Logger('Mailer');
  private tr?: nodemailer.Transporter;

  get enabled() { return !!(config.smtp.host && config.smtp.from); }
  get from() { return config.smtp.from; }

  private get transporter() {
    return (this.tr ??= nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 45_000,
    }));
  }

  async send(m: Mail): Promise<void> {
    if (!this.enabled) throw new Error('SMTP belum dikonfigurasi (isi SMTP_HOST dan SMTP_FROM di .env)');
    const r = await this.transporter.sendMail({ from: config.smtp.from, to: m.to, subject: m.subject, text: m.text, html: m.html, attachments: m.attachments });
    this.log.log(`terkirim ke ${m.to.length} penerima (${r.messageId})`);
  }
}
