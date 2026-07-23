// ─── Email-сервис ───
// Реализация через Resend (https://resend.com) — простой REST API, free 100/день.
// Если RESEND_API_KEY не задан — fallback: ссылка/тело логируется в stdout
// (чтобы админ мог достать из Render Logs и передать пользователю вручную).
//
// Расширения позже:
//  - notifyVerified / notifyRejected (модерация заявки)
//  - notifyNewDeal (когда контрагент подписал NDA/NCNDA)

import { env } from '../lib/env';

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendViaResend(opts: SendOptions): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** Универсальная отправка email. */
export async function sendEmail(opts: SendOptions): Promise<{ delivered: boolean; via: 'resend' | 'log' }> {
  if (env.RESEND_API_KEY) {
    try {
      await sendViaResend(opts);
      return { delivered: true, via: 'resend' };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[email] Resend failed, falling back to log:', (err as Error).message);
      // продолжаем в log-fallback ниже
    }
  }
  // Log-fallback: пишем в stdout всё, что админ может скопировать
  // eslint-disable-next-line no-console
  console.warn('[email:log-fallback]', JSON.stringify({
    to: opts.to,
    subject: opts.subject,
    text: opts.text || stripHtml(opts.html).slice(0, 500),
  }));
  return { delivered: false, via: 'log' };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Шаблон письма: восстановление пароля ───
export function buildPasswordResetEmail(params: { fullName: string | null; resetUrl: string }): { subject: string; html: string; text: string } {
  const greeting = params.fullName ? `Здравствуйте, ${escapeHtml(params.fullName)}!` : 'Здравствуйте!';
  const subject = 'Восстановление пароля — ATAMEKEN Club';
  const text = [
    greeting,
    '',
    'Кто-то (надеемся, что вы) запросил восстановление пароля для вашего аккаунта на ATAMEKEN Club.',
    '',
    'Если это были вы, перейдите по ссылке для установки нового пароля:',
    params.resetUrl,
    '',
    'Ссылка действует 1 час. Если вы не запрашивали восстановление — просто проигнорируйте это письмо.',
    '',
    '—',
    'ATAMEKEN Club',
    'atameken.club.kz@gmail.com',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#1f2937;line-height:1.55;max-width:560px;margin:0 auto;padding:1.5rem">
  <div style="border-bottom:3px solid #C8282A;padding-bottom:.75rem;margin-bottom:1.5rem">
    <div style="font-family:'Cormorant Garamond',serif;font-size:1.35rem;font-weight:600;color:#0F1620;letter-spacing:.02em">«ATAMEKEN Club»</div>
    <div style="font-size:.78rem;color:#718096;letter-spacing:.14em;text-transform:uppercase;margin-top:.2rem">Бизнес-сообщество</div>
  </div>
  <p style="font-size:1rem;margin:0 0 1rem">${greeting}</p>
  <p style="font-size:.92rem;color:#4A5568;margin:0 0 1.25rem">Кто-то (надеемся, что вы) запросил восстановление пароля для вашего аккаунта на ATAMEKEN Club.</p>
  <p style="font-size:.92rem;color:#4A5568;margin:0 0 1.25rem">Если это были вы, нажмите на кнопку ниже для установки нового пароля:</p>
  <p style="margin:1.5rem 0;text-align:center">
    <a href="${params.resetUrl}" style="display:inline-block;background:#C8282A;color:#fff;text-decoration:none;font-weight:600;padding:.85rem 2rem;border-radius:4px;font-size:.92rem">Установить новый пароль</a>
  </p>
  <p style="font-size:.82rem;color:#718096;margin:0 0 .5rem">Или скопируйте эту ссылку в браузер:</p>
  <p style="font-size:.78rem;color:#1A6FC4;word-break:break-all;margin:0 0 1.5rem"><a href="${params.resetUrl}" style="color:#1A6FC4">${params.resetUrl}</a></p>
  <div style="border-top:1px solid #E2E8F0;padding-top:1rem;font-size:.78rem;color:#94a3b8;line-height:1.55">
    <p style="margin:0 0 .35rem"><strong style="color:#4A5568">Ссылка действительна 1 час.</strong></p>
    <p style="margin:0 0 1rem">Если вы не запрашивали восстановление — просто проигнорируйте это письмо. Ваш пароль останется без изменений.</p>
    <p style="margin:0;font-size:.72rem">© ${new Date().getFullYear()} ТОО «ATAMEKEN Club» · Алматы, Казахстан · <a href="mailto:atameken.club.kz@gmail.com" style="color:#94a3b8">atameken.club.kz@gmail.com</a></p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string));
}
