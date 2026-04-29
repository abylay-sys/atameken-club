import type { CompanyProfile, User } from '@prisma/client';
import { env } from '../lib/env';

const ROLE_LABEL: Record<string, string> = {
  SEEKER: 'Соискатель инвестиций',
  INVESTOR: 'Инвестор',
  FRANCHISE: 'Франчайзер / Франчайзи',
  SALE: 'Продавец / Покупатель бизнеса',
};

function esc(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMessage(profile: CompanyProfile, user: User): string {
  const lines = [
    '<b>🆕 Новая заявка на верификацию</b>',
    '',
    `<b>Компания:</b> ${esc(profile.companyName)}`,
    `<b>Тип:</b> ${esc(ROLE_LABEL[user.role] ?? user.role)}`,
    `<b>БИН:</b> ${esc(profile.bin)}`,
    `<b>Отрасль:</b> ${esc(profile.industry)}`,
    `<b>Регион:</b> ${esc(profile.region)}`,
    `<b>Год основания:</b> ${esc(profile.foundedYear)}`,
    `<b>Выручка:</b> ${esc(profile.revenue)}`,
    `<b>Сотрудников:</b> ${esc(profile.employees)}`,
    `<b>Потребность в инвестициях:</b> ${esc(profile.investmentNeed)}`,
    `<b>Сайт:</b> ${esc(profile.website)}`,
    '',
    '<b>Контакты</b>',
    `👤 ${esc(user.fullName ?? profile.contactName)}`,
    `✉️ ${esc(user.email)}`,
    `📞 ${esc(user.phone ?? profile.contactPhone)}`,
    '',
    '<b>Описание</b>',
    esc(profile.description).slice(0, 800),
    '',
    `<i>ID заявки: ${profile.id}</i>`,
  ];
  return lines.join('\n');
}

export async function notifyModerators(profile: CompanyProfile, user: User): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_MODERATOR_CHAT_ID) {
    // eslint-disable-next-line no-console
    console.warn('[telegram] Skipping — TELEGRAM_BOT_TOKEN or TELEGRAM_MODERATOR_CHAT_ID not configured');
    return;
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_MODERATOR_CHAT_ID,
      text: formatMessage(profile, user),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

export async function notifyCartOrder(payload: {
  name: string;
  contact: string;
  comment?: string;
  items: { id: string; name: string }[];
  userId?: string;
  companyName?: string;
  phone?: string;
}): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_MODERATOR_CHAT_ID) {
    // eslint-disable-next-line no-console
    console.warn('[telegram] Skipping cart-order — TELEGRAM_BOT_TOKEN or TELEGRAM_MODERATOR_CHAT_ID not configured');
    return;
  }
  const itemsList = payload.items.map((it, idx) => `${idx + 1}. ${esc(it.name)}`).join('\n');
  const authedTag = payload.userId ? '✅ <i>зарегистрированный пользователь</i>' : '⚪️ <i>гость (не залогинен)</i>';
  const text = [
    '<b>🛒 Новая заявка на услуги</b>',
    authedTag,
    '',
    `<b>Клиент:</b> ${esc(payload.name)}`,
    payload.companyName ? `<b>Компания:</b> ${esc(payload.companyName)}` : null,
    `<b>Контакт:</b> ${esc(payload.contact)}`,
    payload.phone ? `<b>Телефон:</b> ${esc(payload.phone)}` : null,
    payload.userId ? `<b>User ID:</b> <code>${esc(payload.userId)}</code>` : null,
    payload.comment ? `<b>Комментарий:</b> ${esc(payload.comment)}` : null,
    '',
    '<b>Услуги в корзине:</b>',
    itemsList,
  ]
    .filter(Boolean)
    .join('\n');

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_MODERATOR_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}
