import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import logger from '../logger';

export interface SendEmailParams {
  email: string;
  subject: string;
  message?: string;
  html?: string;
  attachments?: SendMailOptions['attachments'];
}

export interface EmailSendResult {
  success: boolean;
  info?: nodemailer.SentMessageInfo;
  error?: string;
}

class EmailServiceProvider {
  private transporter: Transporter | null = null;
  private isInitialized = false;

  private setupTransport(): void {
    if (this.isInitialized) return;

    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USERNAME) {
      logger.warn('⚠️ EMAIL WARNING: Missing EMAIL_HOST or EMAIL_USERNAME in .env file. Emails will fail.');
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });

    this.transporter.verify((error) => {
      if (error) {
        logger.error(`❌ Email Connection Failed: ${error.message}`);
      } else {
        logger.info('✅ Email Server Ready');
      }
    });

    this.isInitialized = true;
  }

  public async send({ email, subject, message, html, attachments = [] }: SendEmailParams): Promise<EmailSendResult> {
    this.setupTransport();

    if (!email) {
      logger.warn(`⚠️ Email Skipped: No recipient email provided for subject "${subject}"`);
      return { success: false, error: 'No recipient email provided' };
    }

    if (!this.transporter) {
      return { success: false, error: 'Email transporter is not initialized' };
    }

    const mailOptions: SendMailOptions = {
      from: process.env.EMAIL_FROM || `"Apex App" <${process.env.EMAIL_USERNAME}>`,
      to: email,
      subject,
      text: message,
      html,
      attachments,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Email Sent to ${email} | ID: ${info.messageId}`);
      
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        logger.info(`🔗 Preview URL: ${previewUrl}`);
      }
      
      return { success: true, info };
    } catch (err) {
      const error = err as Error;
      logger.error(`💥 Email Error [To: ${email}]: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

export const EmailService = new EmailServiceProvider();