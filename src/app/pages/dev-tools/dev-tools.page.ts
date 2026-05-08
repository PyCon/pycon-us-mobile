import { Component } from '@angular/core';
import { Storage } from '@ionic/storage-angular';
import { ToastController } from '@ionic/angular';
import { ConferenceData } from '../../providers/conference-data';
import {
  NotificationsService,
  NotificationCategory,
} from '../../providers/notifications.service';
import { environment } from '../../../environments/environment';

interface NotifTestRow {
  key: NotificationCategory;
  label: string;
}

@Component({
  selector: 'app-dev-tools',
  templateUrl: './dev-tools.page.html',
  styleUrls: ['./dev-tools.page.scss'],
})
export class DevToolsPage {
  env = environment;
  storageKeys: string[] = [];
  storageCount = 0;
  scanCount = 0;

  // Order mirrors the Notifications settings page so the buttons line up
  // visually with the toggles users would flip to test gating.
  notifTests: NotifTestRow[] = [
    { key: 'lightning', label: 'Lightning Talk sign-ups' },
    { key: 'openSpace', label: 'Open Space sign-ups' },
    { key: 'announcements', label: 'Announcements' },
    { key: 'scheduleChanges', label: 'Schedule changes' },
    { key: 'dailyDigest', label: 'Daily digest' },
    { key: 'emergency', label: 'Emergency & safety' },
  ];

  constructor(
    private storage: Storage,
    private toastCtrl: ToastController,
    private confData: ConferenceData,
    private notifications: NotificationsService,
  ) {}

  async testNotif(category: NotificationCategory, label: string) {
    const result = await this.notifications.scheduleCategoryTestNotification(category);
    let message: string;
    let color: 'success' | 'warning' | 'medium' | 'danger';
    switch (result.outcome) {
      case 'fired':
        message = `${label}: firing at ${result.fireAt.toLocaleTimeString()}.`;
        color = 'success';
        break;
      case 'muted':
        message = `${label}: toggle is OFF — gating works, no notification scheduled.`;
        color = 'warning';
        break;
      case 'denied':
        message = `${label}: OS notification permission denied.`;
        color = 'danger';
        break;
      case 'web':
        message = `${label}: only fires on iOS / Android.`;
        color = 'medium';
        break;
    }
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
      color,
    });
    toast.present();
  }

  async ionViewWillEnter() {
    await this.refreshStats();
  }

  async refreshStats() {
    const keys = await this.storage.keys();
    this.storageKeys = keys;
    this.storageCount = keys.length;
    this.scanCount = keys.filter(k =>
      k.startsWith('pending-scan-') || k.startsWith('synced-scan-') || k.startsWith('failed-scan-')
    ).length;
  }

  async clearScanData() {
    const keys = await this.storage.keys();
    let cleared = 0;
    for (const key of keys) {
      if (key.startsWith('pending-scan-') || key.startsWith('synced-scan-') || key.startsWith('failed-scan-') ||
          key.startsWith('pending-note-') || key.startsWith('note-') ||
          key === 'staff-sponsor-id' || key === 'staff-sponsor-name' || key === 'hasScannerConsent') {
        await this.storage.remove(key);
        cleared++;
      }
    }
    await this.showToast(`Cleared ${cleared} scan entries`);
    await this.refreshStats();
  }

  async invalidateCache() {
    this.confData.invalidateCache();
    await this.showToast('Schedule cache invalidated — pull to refresh');
    await this.refreshStats();
  }

  async nukeStorage() {
    await this.storage.clear();
    await this.showToast('All storage wiped — reloading...');
    setTimeout(() => window.location.reload(), 500);
  }

  async dumpStorage() {
    const dump: any = {};
    await this.storage.forEach((value, key) => {
      dump[key] = typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : String(value);
    });
    console.table(dump);
    await this.showToast('Storage dumped to console (open DevTools)');
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
      color: 'dark',
    });
    toast.present();
  }
}
