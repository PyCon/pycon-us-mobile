import { Component, OnDestroy, OnInit } from '@angular/core';
import { Platform, ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Subscription } from 'rxjs';
import {
  NotificationsService,
  NotificationCategory,
  NotificationPrefs,
} from '../../providers/notifications.service';

// App Store / Play Store URLs for the "please update" banner. Tap the
// link in the banner → opens the store listing in the appropriate
// system app. Bundle id is `org.pycon.us.2023.onsite`.
const APP_STORE_URL = 'https://apps.apple.com/us/app/pycon-us-2023/id6446810296';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=org.pycon.us';

@Component({
  selector: 'app-notification-settings',
  templateUrl: './notification-settings.page.html',
  styleUrls: ['./notification-settings.page.scss'],
})
export class NotificationSettingsPage implements OnInit, OnDestroy {
  prefs: NotificationPrefs = {
    lightning: true,
    openSpace: true,
    emergency: true,
    announcements: true,
    scheduleChanges: true,
    dailyDigest: true,
  };
  loaded = false;
  showTitle = false;
  fcmToken: string | null = null;
  needsAppUpdate = false;
  storeUrl = APP_STORE_URL;
  private tokenSub?: Subscription;

  constructor(
    private notifications: NotificationsService,
    private toastCtrl: ToastController,
    private platform: Platform,
  ) {
    // The Notifications page can ride live updates ahead of an App Store
    // binary that doesn't yet have the new native plugins compiled in
    // (FirebaseMessaging, FirebaseAnalytics, LocalNotifications). Detect
    // that mismatch up-front so the page shows a "please update" banner
    // instead of a row of toggles that look fine but silently no-op.
    if (this.platform.is('hybrid')) {
      this.needsAppUpdate =
        !Capacitor.isPluginAvailable('FirebaseMessaging') ||
        !Capacitor.isPluginAvailable('LocalNotifications');
      this.storeUrl = this.platform.is('android') ? PLAY_STORE_URL : APP_STORE_URL;
    }
  }

  onScroll(event: any) {
    this.showTitle = event.detail.scrollTop > 100;
  }

  async ngOnInit() {
    this.prefs = await this.notifications.getPrefs();
    this.loaded = true;
    this.tokenSub = this.notifications.fcmToken$.subscribe((token) => {
      this.fcmToken = token;
    });
  }

  ngOnDestroy() {
    this.tokenSub?.unsubscribe();
  }

  async onToggle(key: NotificationCategory, value: boolean) {
    this.prefs = { ...this.prefs, [key]: value };
    await this.notifications.setPref(key, value);
    const toast = await this.toastCtrl.create({
      message: value ? 'Notifications enabled' : 'Notifications disabled',
      duration: 1500,
      position: 'bottom',
    });
    toast.present();
  }

  // True iff every category is currently enabled. Drives the master
  // toggle's checked state. Indeterminate (some on, some off) reads as
  // false so flipping it pushes everything on.
  get allEnabled(): boolean {
    return (
      this.prefs.lightning &&
      this.prefs.openSpace &&
      this.prefs.announcements &&
      this.prefs.scheduleChanges &&
      this.prefs.dailyDigest &&
      this.prefs.emergency
    );
  }

  // True iff every category is currently disabled. Drives copy on the
  // master toggle's subtitle so users can tell which state they're in
  // when categories are mixed.
  get allDisabled(): boolean {
    return (
      !this.prefs.lightning &&
      !this.prefs.openSpace &&
      !this.prefs.announcements &&
      !this.prefs.scheduleChanges &&
      !this.prefs.dailyDigest &&
      !this.prefs.emergency
    );
  }

  async onMasterToggle(value: boolean) {
    this.prefs = {
      ...this.prefs,
      lightning: value,
      openSpace: value,
      announcements: value,
      scheduleChanges: value,
      dailyDigest: value,
      emergency: value,
    };
    await this.notifications.setAllPrefs(value);
    const toast = await this.toastCtrl.create({
      message: value ? 'All notifications enabled' : 'All notifications muted',
      duration: 1500,
      position: 'bottom',
    });
    toast.present();
  }

  // Deep-link to the OS Settings page for this app. iOS exposes the
  // `app-settings:` URL scheme — when invoked with target=_system the
  // Capacitor WKWebView delegates to UIApplication.open(), which lands
  // on the app's per-app Settings pane (not Settings root).
  get canOpenAppSettings(): boolean {
    return this.platform.is('hybrid') && this.platform.is('ios');
  }

  async openAppSettings() {
    try {
      window.open('app-settings:', '_system');
    } catch (err) {
      console.warn('Could not open app settings', err);
      const toast = await this.toastCtrl.create({
        message: 'Open Settings → PyCon US to manage notification permission.',
        duration: 2500,
        position: 'bottom',
      });
      toast.present();
    }
  }

  async copyToken() {
    if (!this.fcmToken) return;
    try {
      await navigator.clipboard.writeText(this.fcmToken);
      const toast = await this.toastCtrl.create({
        message: 'FCM token copied',
        duration: 1500,
        position: 'bottom',
        color: 'success',
      });
      toast.present();
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not copy — long-press the token to select.',
        duration: 2500,
        position: 'bottom',
      });
      toast.present();
    }
  }
}
