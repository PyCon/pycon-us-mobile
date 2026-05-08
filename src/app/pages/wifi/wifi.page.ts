import { Component, OnInit, ViewChild } from '@angular/core';
import { IonContent, ToastController } from '@ionic/angular';
import { ConferenceData } from '../../providers/conference-data';
import { LiveUpdateService } from '../../providers/live-update.service';

@Component({
  selector: 'app-wifi',
  templateUrl: './wifi.page.html',
  styleUrls: ['./wifi.page.scss'],
})
export class WifiPage implements OnInit {
  @ViewChild(IonContent) content: IonContent;
  showTitle = false;
  wifiSponsor: any = null;

  constructor(
    private toastCtrl: ToastController,
    private confData: ConferenceData,
    public liveUpdateService: LiveUpdateService,
  ) {}

  ngOnInit() {
    this.confData.getSponsors().subscribe((sponsors: any) => {
      if (!sponsors) {
        return;
      }
      // sponsors is keyed by level; iterate values across all levels
      for (const level of Object.keys(sponsors)) {
        const list = sponsors[level];
        if (!Array.isArray(list)) {
          continue;
        }
        const match = list.find(
          (s: any) => s && typeof s.name === 'string' && s.name.toLowerCase().includes('temporal'),
        );
        if (match) {
          this.wifiSponsor = match;
          return;
        }
      }
    });
  }

  onScroll(event: any) {
    this.showTitle = event.detail.scrollTop > 100;
  }

  async copyPassword() {
    await navigator.clipboard.writeText('pyconLB2026');
    const toast = await this.toastCtrl.create({
      message: 'Password copied!',
      duration: 1500,
      position: 'bottom',
      color: 'success',
    });
    toast.present();
  }

  getSponsorSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

}
