import { google } from 'googleapis';
import type { CompanyProfile, User } from '@prisma/client';
import { env } from '../lib/env';

const SHEET_TAB = 'Profiles';
const HEADER_ROW = [
  'Submitted At',
  'User ID',
  'Email',
  'Full Name',
  'Phone',
  'Role',
  'Company Name',
  'BIN',
  'Industry',
  'Region',
  'Founded Year',
  'Revenue',
  'Employees',
  'Investment Need',
  'Investment Goal',
  'Website',
  'Contact Name',
  'Contact Phone',
  'Contact Email',
  'Description',
  'Status',
];

function getAuth() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_BASE64 is not set');
  }
  const json = JSON.parse(
    Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'),
  );
  return new google.auth.JWT({
    email: json.client_email,
    key: json.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function ensureHeader(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string) {
  const range = `${SHEET_TAB}!A1:U1`;
  const got = await sheets.spreadsheets.values.get({ spreadsheetId, range }).catch(() => null);
  const firstCell = got?.data?.values?.[0]?.[0];
  if (!firstCell) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

export async function appendProfileToSheet(profile: CompanyProfile, user: User): Promise<void> {
  if (!env.GOOGLE_SHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
    // eslint-disable-next-line no-console
    console.warn('[sheets] Skipping — GOOGLE_SHEET_ID or service account not configured');
    return;
  }
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = env.GOOGLE_SHEET_ID;

  await ensureHeader(sheets, spreadsheetId);

  const row = [
    (profile.submittedAt ?? new Date()).toISOString(),
    user.id,
    user.email,
    user.fullName ?? '',
    user.phone ?? '',
    user.role,
    profile.companyName,
    profile.bin ?? '',
    profile.industry ?? '',
    profile.region ?? '',
    profile.foundedYear ?? '',
    profile.revenue ?? '',
    profile.employees ?? '',
    profile.investmentNeed ?? '',
    profile.investmentGoal ?? '',
    profile.website ?? '',
    profile.contactName ?? '',
    profile.contactPhone ?? '',
    profile.contactEmail ?? '',
    profile.description ?? '',
    profile.status,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_TAB}!A:U`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}
