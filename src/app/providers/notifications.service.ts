import { Injectable } from '@angular/core';
import { Platform, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import {
  LocalNotifications,
  ScheduleOptions,
  PermissionStatus,
} from '@capacitor/local-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { BehaviorSubject } from 'rxjs';


export type NotificationCategory =
  | 'lightning'
  | 'openSpace'
  | 'emergency'
  | 'announcements'
  | 'scheduleChanges';

export interface NotificationPrefs {
  lightning: boolean;
  openSpace: boolean;
  emergency: boolean;
  announcements: boolean;
  scheduleChanges: boolean;
}

interface ScheduledReminder {
  id: number;
  category: 'lightning' | 'openSpace';
  title: string;
  body: string;
  fireAt: Date;
}

const PREF_KEY = 'notification_prefs';

// Default: opt-in by default for the conference. Users who don't want them
// can flip the toggles off in Settings.
const DEFAULT_PREFS: NotificationPrefs = {
  lightning: true,
  openSpace: true,
  emergency: true,
  announcements: true,
  scheduleChanges: true,
};

// Map of toggle category → FCM topic name. Only push-driven categories
// appear here; client-scheduled local notifications (lightning, openSpace)
// are absent. Topic strings must be alphanumeric + dashes/underscores per
// FCM rules. Send pushes from Firebase Console → New campaign →
// Notifications → Target → Topic → enter the topic name.
const TOPIC_BY_CATEGORY: Partial<Record<NotificationCategory, string>> = {
  emergency: 'emergency',
  announcements: 'announcements',
  scheduleChanges: 'schedule-changes',
};

// All times PDT (America/Los_Angeles, UTC-7). Reminders fire 15 minutes
// before the signup window opens. Edit this table if the published
// signup times change — the service rebuilds its schedule from this list
// each time `applyPrefs()` runs.
//
// PyCon US 2026 calendar: Thu = May 14, Fri = May 15, Sat = May 16, Sun = May 17.
// (PYMOBIL-106's issue body had off-by-one dates — fixed here.)
// Fri/Sat open-space times were flagged as needing verification by staff;
// the 5:00 AM placeholder kept here so the infra ships — adjust if staff
// publish different times.
const REMINDERS: Array<Omit<ScheduledReminder, 'id'>> = [
  // Lightning talks
  {
    category: 'lightning',
    title: 'Lightning Talk sign-ups open soon',
    body: 'Friday morning slot — signup opens at 9:00 AM, deadline 1:00 PM.',
    fireAt: new Date('2026-05-15T08:45:00-07:00'),
  },
  {
    category: 'lightning',
    title: 'Lightning Talk sign-ups open soon',
    body: 'Friday evening slot — signup opens at 5:00 AM, deadline 9:00 AM.',
    fireAt: new Date('2026-05-15T04:45:00-07:00'),
  },
  {
    category: 'lightning',
    title: 'Lightning Talk sign-ups open soon',
    body: 'Saturday morning slot — signup opens at 9:00 AM, deadline 1:00 PM.',
    fireAt: new Date('2026-05-16T08:45:00-07:00'),
  },
  {
    category: 'lightning',
    title: 'Lightning Talk sign-ups open soon',
    body: 'Saturday afternoon slot — signup opens at 5:00 AM, deadline 9:00 AM.',
    fireAt: new Date('2026-05-16T04:45:00-07:00'),
  },
  // Open spaces
  {
    category: 'openSpace',
    title: 'Open Space sign-ups open soon',
    body: 'Thursday slots open at 5:00 AM PDT.',
    fireAt: new Date('2026-05-14T04:45:00-07:00'),
  },
  {
    category: 'openSpace',
    title: 'Open Space sign-ups open soon',
    body: 'Friday slots open at 5:00 AM PDT.',
    fireAt: new Date('2026-05-15T04:45:00-07:00'),
  },
  {
    category: 'openSpace',
    title: 'Open Space sign-ups open soon',
    body: 'Saturday slots open at 5:00 AM PDT.',
    fireAt: new Date('2026-05-16T04:45:00-07:00'),
  },
];

// Stable IDs in the 8000–8099 range. Local-notification IDs must be 32-bit
// signed ints; using a deterministic offset means rescheduling cancels the
// prior copy instead of stacking duplicates.
const REMINDER_ID_BASE = 8000;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private prefs: NotificationPrefs = { ...DEFAULT_PREFS };
  private storageReady: Promise<void>;

  // Surfaces the current FCM registration token so the Notifications page
  // can let staff copy it out for testing — Web Inspector is unavailable on
  // App Store builds, so without this they have no way to retrieve it.
  // Updated whenever the OS fires the registration event.
  readonly fcmToken$ = new BehaviorSubject<string | null>(null);

  constructor(
    private storage: Storage,
    private platform: Platform,
    private toastCtrl: ToastController,
  ) {
    this.storageReady = this.storage.create().then(() => undefined);
    this.attachTokenListener();
  }

  private attachTokenListener() {
    if (!this.platform.is('hybrid')) return;
    FirebaseMessaging.addListener('tokenReceived', (event) => {
      if (event?.token) this.fcmToken$.next(event.token);
    }).catch(() => undefined);
    // tokenReceived only fires on rotation; on a fresh launch we may
    // already have a token cached server-side. Pull it eagerly so the
    // Diagnostics card on the Notifications page shows it immediately
    // instead of waiting for the next rotation.
    FirebaseMessaging.getToken()
      .then((res) => {
        if (res?.token) this.fcmToken$.next(res.token);
      })
      .catch(() => undefined);
  }

  async getPrefs(): Promise<NotificationPrefs> {
    await this.storageReady;
    const saved = await this.storage.get(PREF_KEY);
    if (saved && typeof saved === 'object') {
      this.prefs = { ...DEFAULT_PREFS, ...saved };
    }
    return { ...this.prefs };
  }

  async setPref(key: NotificationCategory, value: boolean): Promise<void> {
    await this.storageReady;
    this.prefs = { ...this.prefs, [key]: value };
    await this.storage.set(PREF_KEY, this.prefs);
    const topic = TOPIC_BY_CATEGORY[key];
    if (topic) {
      await this.syncTopic(topic, value);
    }
    await this.applyPrefs();
  }

  // Bulk setter for the "Mute all" / "Enable all" master control. Flips
  // every category to the given value, persists once, then runs a single
  // applyPrefs (which handles topic + local-notification reconciliation).
  async setAllPrefs(value: boolean): Promise<void> {
    await this.storageReady;
    const next: NotificationPrefs = { ...this.prefs };
    (Object.keys(next) as NotificationCategory[]).forEach((k) => {
      next[k] = value;
    });
    this.prefs = next;
    await this.storage.set(PREF_KEY, this.prefs);
    await this.applyPrefs();
  }

  // Subscribe/unsubscribe the device from an FCM topic so the toggle
  // actually opts the user out of OS-level pushes — not just the in-app
  // banner. Idempotent; safe to call repeatedly. No-op on web.
  private async syncTopic(topic: string, enabled: boolean): Promise<void> {
    if (!this.platform.is('hybrid')) return;
    try {
      if (enabled) {
        await FirebaseMessaging.subscribeToTopic({ topic });
      } else {
        await FirebaseMessaging.unsubscribeFromTopic({ topic });
      }
    } catch (err) {
      console.warn(`NotificationsService: topic sync failed for ${topic}`, err);
    }
  }

  // Re-evaluate scheduled local notifications against the current prefs.
  // Called on app startup and after every toggle change. Push-driven
  // categories (emergency) don't need rescheduling — they're filtered at
  // receive time in handleEmergencyPush().
  async applyPrefs(): Promise<void> {
    if (!this.platform.is('hybrid')) return;
    // Re-assert FCM topic subscriptions on every apply — covers cases
    // where the device's topic state drifts from prefs (fresh install,
    // token rotation, app reinstall) by always pushing local state up to
    // Firebase.
    for (const [category, topic] of Object.entries(TOPIC_BY_CATEGORY)) {
      if (!topic) continue;
      const enabled = this.prefs[category as NotificationCategory];
      await this.syncTopic(topic, enabled);
    }
    try {
      const granted = await this.ensurePermission();
      if (!granted) return;

      // Cancel anything we previously scheduled. Safe to call with IDs that
      // aren't currently scheduled — the plugin no-ops them.
      const allIds = REMINDERS.map((_, idx) => ({ id: REMINDER_ID_BASE + idx }));
      await LocalNotifications.cancel({ notifications: allIds });

      const now = Date.now();
      const toSchedule: ScheduleOptions['notifications'] = [];
      REMINDERS.forEach((r, idx) => {
        if (!this.prefs[r.category]) return;
        if (r.fireAt.getTime() <= now) return; // skip past windows
        toSchedule.push({
          id: REMINDER_ID_BASE + idx,
          title: r.title,
          body: r.body,
          schedule: { at: r.fireAt, allowWhileIdle: true },
        });
      });
      if (toSchedule.length > 0) {
        await LocalNotifications.schedule({ notifications: toSchedule });
      }
    } catch (err) {
      console.warn('NotificationsService: applyPrefs failed', err);
    }
  }

  // With FCM topics handling opt-out at the server level, devices that
  // have toggled a category off won't receive the push at all. We keep
  // this check as a safety net for pushes that staff send to "all
  // devices" rather than via a topic — those still reach everyone, so
  // we suppress the in-app banner if every push category is disabled.
  shouldShowPushBanner(): boolean {
    return (
      this.prefs.emergency ||
      this.prefs.announcements ||
      this.prefs.scheduleChanges
    );
  }

  private async ensurePermission(): Promise<boolean> {
    let status: PermissionStatus;
    try {
      status = await LocalNotifications.checkPermissions();
    } catch {
      return false;
    }
    if (status.display === 'granted') return true;
    if (status.display === 'denied') return false;
    try {
      const requested = await LocalNotifications.requestPermissions();
      return requested.display === 'granted';
    } catch {
      return false;
    }
  }
}
