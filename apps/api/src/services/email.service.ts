import { env } from "../config/env";

export class EmailService {
  isConfigured() {
    return Boolean(env.RESEND_API_KEY?.trim());
  }

  async send(input: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ sent: boolean }> {
    if (!this.isConfigured()) {
      console.info(`[email] Skipped (no RESEND_API_KEY): ${input.subject} → ${input.to}`);
      return { sent: false };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`[email] Resend error ${res.status}: ${body}`);
      return { sent: false };
    }

    return { sent: true };
  }

  async sendWelcome(to: string, name: string) {
    return this.send({
      to,
      subject: "Welcome to Nebula",
      html: `<p>Hi ${name},</p><p>Your account is ready. Create your first project and describe your app in plain English.</p>`,
    });
  }

  async sendBuildComplete(to: string, projectName: string, projectUrl: string) {
    return this.send({
      to,
      subject: `Build complete — ${projectName}`,
      html: `<p>Your project <strong>${projectName}</strong> is ready.</p><p><a href="${projectUrl}">Open workspace</a></p>`,
    });
  }
}

export const emailService = new EmailService();
