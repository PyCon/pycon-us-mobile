import { Component, OnDestroy, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import {
  NotificationsService,
  NotificationCategory,
  NotificationPrefs,
} from '../../providers/notifications.service';

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
  };
  loaded = false;
  showTitle = false;
  fcmToken: string | null = null;
  private tokenSub?: Subscription;

  onScroll(event: any) {
    this.showTitle = event.detail.scrollTop > 100;
  }

  constructor(
    private notifications: NotificationsService,
    private toastCtrl: ToastController,
  ) {}

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
