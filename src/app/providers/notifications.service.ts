import { Injectable } from '@angular/core';
import { Platform, ToastController } from '@ionic/angular';
import { Storage } from '@ionic/storage-angular';
import {
  LocalNotifications,
  ScheduleOptions,
  PermissionStatus,
} from '@capacitor/local-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { BehaviorSubject } from 'rxjs';


export type NotificationCategory =
  | 'lightning'
  | 'openSpace'
  | 'emergency'
  | 'announcements'
  | 'scheduleChanges'
  | 'dailyDigest';

export interface NotificationPrefs {
  lightning: boolean;
  openSpace: boolean;
  emergency: boolean;
  announcements: boolean;
  scheduleChanges: boolean;
  dailyDigest: boolean;
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
  dailyDigest: true,
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
  dailyDigest: 'daily-digest',
};

// All times PDT (America/Los_Angeles, UTC-7). Reminders fire 15 minutes
// before the signup window opens. Edit this table if the published
// signup times change — the service rebuilds its schedule from this list
// each time `applyPrefs()` runs.
//
// PyCon US 2026 calendar: Thu = May 14, Fri = May 15, Sat = May 16, Sun = May 17.
// Open-space windows confirmed against pycon-site/load-open-spaces.py:
//   Fri slots → signup opens Thu May 14, 5:00 PM
//   Sat slots → signup opens Sat May 16, 8:00 AM
//   Sun slots → signup opens Sun May 17, 8:00 AM
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
    body: 'Friday slots open Thursday at 5:00 PM PDT.',
    fireAt: new Date('2026-05-14T16:45:00-07:00'),
  },
  {
    category: 'openSpace',
    title: 'Open Space sign-ups open soon',
    body: 'Saturday slots open at 8:00 AM PDT.',
    fireAt: new Date('2026-05-16T07:45:00-07:00'),
  },
  {
    category: 'openSpace',
    title: 'Open Space sign-ups open soon',
    body: 'Sunday slots open at 8:00 AM PDT.',
    fireAt: new Date('2026-05-17T07:45:00-07:00'),
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
    this.logToggle(key, value);
    this.setUserProperty(key, value);
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
    this.logEvent('toggle_all_notifications', { enabled: value });
    (Object.keys(this.prefs) as NotificationCategory[]).forEach((k) => {
      this.setUserProperty(k, value);
    });
  }

  // Push the current pref state into Firebase user properties so audience
  // segmentation in the Firebase / GA console reports today's snapshot,
  // not just deltas. Called from setPref/setAllPrefs (above) and once on
  // startup (in applyPrefs) so pre-existing installs report state too.
  private snapshotPrefsToAnalytics(): void {
    (Object.keys(this.prefs) as NotificationCategory[]).forEach((k) => {
      this.setUserProperty(k, this.prefs[k]);
    });
  }

  private logToggle(key: NotificationCategory, value: boolean): void {
    this.logEvent('toggle_notification', {
      // Stick with snake_case keys — Firebase Analytics' default schema.
      category: key,
      enabled: value,
    });
  }

  private logEvent(name: string, params: Record<string, any>): void {
    if (!this.platform.is('hybrid')) return;
    FirebaseAnalytics.logEvent({ name, params }).catch((err) => {
      console.warn(`FirebaseAnalytics.logEvent(${name}) failed`, err);
    });
  }

  private setUserProperty(key: NotificationCategory, value: boolean): void {
    if (!this.platform.is('hybrid')) return;
    // User-property keys must be ≤24 chars and start with a letter; the
    // `notif_` prefix keeps them grouped in Firebase Analytics' UI.
    FirebaseAnalytics.setUserProperty({
      key: `notif_${key}`.slice(0, 24),
      value: value ? 'on' : 'off',
    }).catch(() => undefined);
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
    // Snapshot current prefs into Firebase Analytics user properties on
    // every cold-start apply — Audiences / segments in the Firebase
    // console will reflect today's state for every active install, not
    // just users who flip a toggle.
    this.snapshotPrefsToAnalytics();
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
      this.prefs.scheduleChanges ||
      this.prefs.dailyDigest
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
