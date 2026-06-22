import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STATE_BUCKET = 'dashboard-files';
const STATE_PATH = 'personal/dashboard-state.json';
const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
const LOOKBACK_MS = 20 * 60 * 1000;
const COMPLETION_GRACE_MS = 15 * 60 * 1000;

type ReminderFlag = 'twoDays' | 'oneDay' | 'threeHours' | 'startNow' | 'completed';
type NotificationType = '2_days_before' | '1_day_before' | '3_hours_before' | 'at_event_time' | 'after_completion';

type NotificationFlags = Record<ReminderFlag, boolean>;

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  completed: boolean;
  done: boolean;
  notificationEnabled: boolean;
  notificationFlags: NotificationFlags;
  timeZone: string;
  completedAt: string;
  createdAt: string;
}

interface EventHistoryItem {
  id: string;
  originalEventId: string;
  title: string;
  date: string;
  time: string;
  completed: true;
  notificationEnabled: boolean;
  notificationFlags: NotificationFlags;
  timeZone: string;
  completedAt: string;
  createdAt: string;
}

interface DashboardState {
  events: CalendarEvent[];
  eventHistory: EventHistoryItem[];
  updatedAt?: string;
  [key: string]: unknown;
}

interface DashboardRow {
  user_id: string;
  data: unknown;
  updated_at: string | null;
}

interface NotificationClaim {
  id: string;
}

interface ProcessContext {
  admin: SupabaseClient;
  dashboardId: string;
  targetExternalId: string;
  userId: string | null;
  nowMs: number;
  siteUrl: string;
}

interface ProcessResult {
  checked: number;
  sent: number;
  completed: number;
  changed: boolean;
  errors: string[];
}

interface ReminderStage {
  type: NotificationType;
  flag: ReminderFlag;
  offsetMs: number;
  headingIcon: string;
  body: string;
}

const REMINDER_STAGES: ReminderStage[] = [
  {
    type: '2_days_before',
    flag: 'twoDays',
    offsetMs: -48 * 60 * 60 * 1000,
    headingIcon: '🔔',
    body: '2 days remaining',
  },
  {
    type: '1_day_before',
    flag: 'oneDay',
    offsetMs: -24 * 60 * 60 * 1000,
    headingIcon: '🔔',
    body: 'tomorrow',
  },
  {
    type: '3_hours_before',
    flag: 'threeHours',
    offsetMs: -3 * 60 * 60 * 1000,
    headingIcon: '🔔',
    body: 'starts in 3 hours',
  },
  {
    type: 'at_event_time',
    flag: 'startNow',
    offsetMs: 0,
    headingIcon: '🔔',
    body: 'starts now',
  },
];

// Vercel calls this endpoint directly, so it has its own small response helpers
// instead of depending on framework-specific Request/Response wrappers.
function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  setCors(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function createHttpError(message: string, statusCode = 500): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function errorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return Number((error as { statusCode?: unknown }).statusCode || 500);
  }
  return 500;
}

function env(...keys: string[]): string {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function normalizePublicUrl(value: string): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function siteUrl(): string {
  return normalizePublicUrl(
    env('VITE_SITE_URL', 'NEXT_PUBLIC_SITE_URL', 'SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL')
  );
}

function defaultExternalId(): string {
  return env('ONESIGNAL_EXTERNAL_ID', 'VITE_ONESIGNAL_EXTERNAL_ID', 'NEXT_PUBLIC_ONESIGNAL_EXTERNAL_ID') || 'hk-dashboard';
}

function supabaseAdmin(): SupabaseClient {
  const url = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_SECRET_KEY');

  if (!url || !key) {
    throw createHttpError('Supabase reminder storage is not configured.', 500);
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function assertCronAccess(req: IncomingMessage): void {
  const expected = env('CRON_SECRET');
  if (!expected) {
    throw createHttpError('CRON_SECRET is required before reminders can run.', 500);
  }

  const actual = String(req.headers.authorization || '').trim();
  if (actual !== `Bearer ${expected}`) {
    throw createHttpError('Unauthorized.', 401);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isDateKey(value: unknown): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function normalizeFlags(value: unknown): NotificationFlags {
  const input = isObject(value) ? value : {};
  return {
    twoDays: Boolean(input.twoDays),
    oneDay: Boolean(input.oneDay),
    threeHours: Boolean(input.threeHours),
    startNow: Boolean(input.startNow),
    completed: Boolean(input.completed),
  };
}

function isCompleted(value: Record<string, unknown>): boolean {
  return Boolean(value.completed || value.done);
}

function normalizeEvent(value: unknown): CalendarEvent {
  const event = isObject(value) ? value : {};
  const title = String(event.title || '').trim() || 'Untitled event';
  return {
    id: String(event.id || `event-${crypto.randomUUID()}`),
    title,
    date: isDateKey(event.date) ? event.date : '',
    time: String(event.time || ''),
    completed: isCompleted(event),
    done: isCompleted(event),
    notificationEnabled: event.notificationEnabled !== false,
    notificationFlags: normalizeFlags(event.notificationFlags),
    timeZone: String(event.timeZone || env('REMINDER_TIME_ZONE', 'TZ') || DEFAULT_TIME_ZONE),
    completedAt: String(event.completedAt || ''),
    createdAt: String(event.createdAt || new Date().toISOString()),
  };
}

function historyFromEvent(event: CalendarEvent, completedAt: string): EventHistoryItem {
  return {
    id: `history-${event.id}`,
    originalEventId: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    completed: true,
    notificationEnabled: event.notificationEnabled,
    notificationFlags: normalizeFlags(event.notificationFlags),
    timeZone: event.timeZone,
    completedAt,
    createdAt: event.createdAt,
  };
}

function normalizeHistoryItem(value: unknown): EventHistoryItem {
  const item = isObject(value) ? value : {};
  const originalEventId = String(item.originalEventId || item.id || `event-${crypto.randomUUID()}`);
  return {
    id: String(item.id || `history-${originalEventId}`),
    originalEventId,
    title: String(item.title || 'Untitled event'),
    date: isDateKey(item.date) ? item.date : '',
    time: String(item.time || ''),
    completed: true,
    notificationEnabled: item.notificationEnabled !== false,
    notificationFlags: normalizeFlags(item.notificationFlags),
    timeZone: String(item.timeZone || env('REMINDER_TIME_ZONE', 'TZ') || DEFAULT_TIME_ZONE),
    completedAt: String(item.completedAt || new Date().toISOString()),
    createdAt: String(item.createdAt || item.originalCreatedAt || new Date().toISOString()),
  };
}

function normalizeDashboardState(value: unknown): DashboardState {
  const input = isObject(value) ? value : {};
  const active: CalendarEvent[] = [];
  const history = new Map<string, EventHistoryItem>();

  const rawHistory = Array.isArray(input.eventHistory)
    ? input.eventHistory
    : Array.isArray(input.completedHistory)
      ? input.completedHistory
      : [];

  rawHistory.forEach((item) => {
    const normalized = normalizeHistoryItem(item);
    history.set(normalized.originalEventId, normalized);
  });

  const rawEvents = Array.isArray(input.events) ? input.events : [];
  rawEvents.forEach((item) => {
    const event = normalizeEvent(item);
    if (!event.date) return;
    if (event.completed) {
      history.set(event.id, historyFromEvent(event, event.completedAt || new Date().toISOString()));
      return;
    }
    active.push(event);
  });

  return {
    ...input,
    events: active,
    eventHistory: Array.from(history.values()).sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
  };
}

function splitDate(date: string): { year: number; month: number; day: number } | null {
  const parts = date.split('-').map(Number);
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function splitTime(time: string): { hour: number; minute: number } {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return { hour: 9, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, Number(match[1]) || 0)),
    minute: Math.min(59, Math.max(0, Number(match[2]) || 0)),
  };
}

function timeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value || 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - date.getTime();
}

function zonedEventMs(event: CalendarEvent): number | null {
  const dateParts = splitDate(event.date);
  if (!dateParts) return null;
  const timeParts = splitTime(event.time);
  const localAsUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0
  );

  let utcMs = localAsUtc - timeZoneOffsetMs(event.timeZone || DEFAULT_TIME_ZONE, new Date(localAsUtc));
  const refinedOffset = timeZoneOffsetMs(event.timeZone || DEFAULT_TIME_ZONE, new Date(utcMs));
  utcMs = localAsUtc - refinedOffset;
  return utcMs;
}

function dueInWindow(nowMs: number, targetMs: number): boolean {
  return nowMs >= targetMs && nowMs - targetMs <= LOOKBACK_MS;
}

// This insert is the duplicate-send lock. If two cron invocations overlap, only
// one can create the unique (dashboard_id, event_id, notification_type) row.
// Failed OneSignal sends release the claim so the next cron can retry.
async function claimNotification(
  admin: SupabaseClient,
  context: ProcessContext,
  event: CalendarEvent | EventHistoryItem,
  notificationType: NotificationType
): Promise<NotificationClaim | null> {
  const { data, error } = await admin
    .from('notification_log')
    .insert({
      dashboard_id: context.dashboardId,
      user_id: context.userId,
      event_id: 'originalEventId' in event ? event.originalEventId : event.id,
      event_title: event.title,
      event_date: event.date || null,
      event_time: event.time || null,
      notification_type: notificationType,
      target_external_id: context.targetExternalId,
      sent_at: null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return null;
    throw createHttpError(error.message || 'Could not claim reminder notification.', 500);
  }

  const row = data as NotificationClaim | null;
  return row?.id ? row : null;
}

async function completeNotificationLog(
  admin: SupabaseClient,
  claim: NotificationClaim,
  onesignalNotificationId: string,
  payload: unknown
): Promise<void> {
  const { error } = await admin
    .from('notification_log')
    .update({
      onesignal_notification_id: onesignalNotificationId,
      sent_at: new Date().toISOString(),
      payload,
    })
    .eq('id', claim.id);

  if (error) {
    throw createHttpError(error.message || 'Could not update reminder log.', 500);
  }
}

async function releaseNotificationClaim(admin: SupabaseClient, claim: NotificationClaim): Promise<void> {
  await admin.from('notification_log').delete().eq('id', claim.id);
}

async function sendOneSignalNotification(
  context: ProcessContext,
  event: CalendarEvent | EventHistoryItem,
  notificationType: NotificationType,
  headingIcon: string,
  body: string
): Promise<{ id: string; payload: unknown }> {
  const appId = env('ONESIGNAL_APP_ID', 'VITE_ONESIGNAL_APP_ID', 'NEXT_PUBLIC_ONESIGNAL_APP_ID');
  const apiKey = env('ONESIGNAL_REST_API_KEY', 'ONESIGNAL_API_KEY');
  if (!appId || !apiKey) {
    throw createHttpError('OneSignal credentials are not configured.', 500);
  }

  const clickUrl = context.siteUrl ? `${context.siteUrl}/calendar` : '/calendar';
  const response = await fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      include_aliases: {
        external_id: [context.targetExternalId],
      },
      headings: {
        en: `${headingIcon} ${event.title}`,
      },
      contents: {
        en: body,
      },
      name: `HK Reminder: ${notificationType}`,
      url: clickUrl,
      web_url: clickUrl,
      data: {
        type: 'calendar_reminder',
        notificationType,
        eventId: 'originalEventId' in event ? event.originalEventId : event.id,
      },
      idempotency_key: `${context.dashboardId}:${'originalEventId' in event ? event.originalEventId : event.id}:${notificationType}`,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { id?: string; errors?: unknown };
  if (!response.ok || !payload.id) {
    throw createHttpError(`OneSignal send failed: ${JSON.stringify(payload.errors || payload)}`, 502);
  }

  return { id: payload.id, payload };
}

// State flags keep the dashboard JSON readable, while notification_log remains
// the source of truth for "sent exactly once" across deploys and cron overlap.
async function sendOnce(
  context: ProcessContext,
  event: CalendarEvent | EventHistoryItem,
  notificationType: NotificationType,
  flag: ReminderFlag,
  headingIcon: string,
  body: string
): Promise<'sent' | 'duplicate' | 'skipped'> {
  if (!event.notificationEnabled || event.notificationFlags[flag]) return 'skipped';

  const claim = await claimNotification(context.admin, context, event, notificationType);
  if (!claim) {
    event.notificationFlags[flag] = true;
    return 'duplicate';
  }

  try {
    const sent = await sendOneSignalNotification(context, event, notificationType, headingIcon, body);
    await completeNotificationLog(context.admin, claim, sent.id, sent.payload);
    event.notificationFlags[flag] = true;
    return 'sent';
  } catch (error) {
    await releaseNotificationClaim(context.admin, claim);
    throw error;
  }
}

// Event records do not have a duration, so the cron marks an event complete one
// cron interval after its start-time notification window has passed.
async function processDashboardState(state: DashboardState, context: ProcessContext): Promise<ProcessResult> {
  const result: ProcessResult = {
    checked: state.events.length + state.eventHistory.length,
    sent: 0,
    completed: 0,
    changed: false,
    errors: [],
  };

  const remainingEvents: CalendarEvent[] = [];

  for (const event of state.events) {
    const eventMs = zonedEventMs(event);
    if (eventMs === null) {
      remainingEvents.push(event);
      continue;
    }

    for (const stage of REMINDER_STAGES) {
      if (!dueInWindow(context.nowMs, eventMs + stage.offsetMs)) continue;
      try {
        const status = await sendOnce(context, event, stage.type, stage.flag, stage.headingIcon, stage.body);
        if (status === 'sent') result.sent += 1;
        if (status !== 'skipped') result.changed = true;
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'Reminder send failed.');
      }
    }

    if (context.nowMs >= eventMs + COMPLETION_GRACE_MS) {
      const completedAt = new Date(context.nowMs).toISOString();
      const historyItem = historyFromEvent(event, event.completedAt || completedAt);
      try {
        const status = await sendOnce(
          context,
          historyItem,
          'after_completion',
          'completed',
          '✅',
          'completed'
        );
        if (status === 'sent') result.sent += 1;
        if (status !== 'skipped') result.changed = true;
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : 'Completion notification failed.');
      }
      state.eventHistory = [
        historyItem,
        ...state.eventHistory.filter((item) => item.originalEventId !== event.id),
      ];
      result.completed += 1;
      result.changed = true;
      continue;
    }

    remainingEvents.push(event);
  }

  state.events = remainingEvents;

  for (const historyItem of state.eventHistory) {
    try {
      const status = await sendOnce(
        context,
        historyItem,
        'after_completion',
        'completed',
        '✅',
        'completed'
      );
      if (status === 'sent') result.sent += 1;
      if (status !== 'skipped') result.changed = true;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'History notification failed.');
    }
  }

  if (result.changed) {
    state.eventHistory.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    state.updatedAt = new Date().toISOString();
  }

  return result;
}

async function readStorageState(admin: SupabaseClient): Promise<{ data: DashboardState | null; updatedAt: string }> {
  const { data, error } = await admin.storage.from(STATE_BUCKET).download(STATE_PATH);
  if (error) {
    const status = Number(error.statusCode || error.status || 0);
    if (status === 404 || /not found/i.test(error.message || '')) {
      return { data: null, updatedAt: '' };
    }
    throw createHttpError(error.message || 'Could not load shared dashboard state.', 500);
  }

  const text = typeof data.text === 'function' ? await data.text() : '{}';
  const payload = JSON.parse(text || '{}') as { data?: unknown; updatedAt?: string };
  return {
    data: payload.data ? normalizeDashboardState(payload.data) : null,
    updatedAt: String(payload.updatedAt || ''),
  };
}

async function writeStorageState(admin: SupabaseClient, data: DashboardState): Promise<void> {
  const payload = {
    data,
    updatedAt: new Date().toISOString(),
  };
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const { error } = await admin.storage.from(STATE_BUCKET).upload(STATE_PATH, buffer, {
    contentType: 'application/json; charset=utf-8',
    upsert: true,
  });
  if (error) throw createHttpError(error.message || 'Could not save shared dashboard state.', 500);
}

async function processSharedStorage(admin: SupabaseClient, nowMs: number): Promise<ProcessResult> {
  const loaded = await readStorageState(admin);
  if (!loaded.data) {
    return { checked: 0, sent: 0, completed: 0, changed: false, errors: [] };
  }

  const externalId = defaultExternalId();
  const result = await processDashboardState(loaded.data, {
    admin,
    dashboardId: `shared:${externalId}`,
    targetExternalId: externalId,
    userId: null,
    nowMs,
    siteUrl: siteUrl(),
  });

  if (result.changed) {
    await writeStorageState(admin, loaded.data);
  }

  return result;
}

async function processAuthRows(admin: SupabaseClient, nowMs: number): Promise<ProcessResult> {
  const summary: ProcessResult = { checked: 0, sent: 0, completed: 0, changed: false, errors: [] };
  const { data, error } = await admin.from('dashboard_state').select('user_id,data,updated_at');
  if (error) {
    throw createHttpError(error.message || 'Could not load dashboard rows.', 500);
  }

  const rows = (Array.isArray(data) ? data : []) as DashboardRow[];
  for (const row of rows) {
    const state = normalizeDashboardState(row.data);
    const result = await processDashboardState(state, {
      admin,
      dashboardId: `user:${row.user_id}`,
      targetExternalId: row.user_id,
      userId: row.user_id,
      nowMs,
      siteUrl: siteUrl(),
    });

    summary.checked += result.checked;
    summary.sent += result.sent;
    summary.completed += result.completed;
    summary.changed = summary.changed || result.changed;
    summary.errors.push(...result.errors);

    if (result.changed) {
      const { error: updateError } = await admin
        .from('dashboard_state')
        .update({ data: state, updated_at: new Date().toISOString() })
        .eq('user_id', row.user_id);
      if (updateError) summary.errors.push(updateError.message || 'Could not save dashboard row.');
    }
  }

  return summary;
}

function mergeResults(results: ProcessResult[]): ProcessResult {
  return results.reduce<ProcessResult>(
    (summary, item) => ({
      checked: summary.checked + item.checked,
      sent: summary.sent + item.sent,
      completed: summary.completed + item.completed,
      changed: summary.changed || item.changed,
      errors: [...summary.errors, ...item.errors],
    }),
    { checked: 0, sent: 0, completed: 0, changed: false, errors: [] }
  );
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Use GET.' });
    return;
  }

  try {
    assertCronAccess(req);
    const admin = supabaseAdmin();
    const nowMs = Date.now();
    const summary = mergeResults([
      await processSharedStorage(admin, nowMs),
      await processAuthRows(admin, nowMs),
    ]);

    json(res, summary.errors.length ? 207 : 200, {
      ok: summary.errors.length === 0,
      checked: summary.checked,
      sent: summary.sent,
      completed: summary.completed,
      changed: summary.changed,
      errors: summary.errors,
    });
  } catch (error) {
    json(res, errorStatus(error), {
      ok: false,
      error: error instanceof Error ? error.message : 'Reminder cron failed.',
    });
  }
}
