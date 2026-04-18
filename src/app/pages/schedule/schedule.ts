import { Component, ViewChild, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonContent, IonList, IonRouterOutlet, LoadingController, ModalController, ToastController, Config } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { ScheduleFilterPage } from '../schedule-filter/schedule-filter';
import { ConferenceData } from '../../providers/conference-data';
import { UserData } from '../../providers/user-data';
import { LiveUpdateService } from '../../providers/live-update.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'page-schedule',
  templateUrl: 'schedule.html',
  styleUrls: ['./schedule.scss'],
})
export class SchedulePage implements OnInit, OnDestroy {
  // Gets a reference to the list element
  @ViewChild('scheduleList', { static: true }) scheduleList: IonList;
  // Get a reference to the search bar
  @ViewChild('search') search : any;
  @ViewChild(IonContent, { static: false }) content: IonContent;

  ios: boolean;
  hasData: boolean = false;
  dayIndex = "0";
  queryText = '';
  segment = 'all';
  excludeTracks: any = [];
  shownSessions: any = [];
  days: any = [];
  groups: any = [];
  confDate: string;
  showSearchbar: boolean;
  searchedAllDays: boolean = false;
  currentTime: Date;
  todayIndex: string = null;
  jumpBtnCollapsed: boolean = false;
  hasFavoritesOnOtherDays: boolean = false;
  allDaysMode: boolean = false;
  private favoritesSubscription: Subscription;

  constructor(
    public alertCtrl: AlertController,
    public confData: ConferenceData,
    public loadingCtrl: LoadingController,
    public modalCtrl: ModalController,
    public route: ActivatedRoute,
    public router: Router,
    public routerOutlet: IonRouterOutlet,
    public toastCtrl: ToastController,
    public user: UserData,
    public config: Config,
    public liveUpdateService: LiveUpdateService,
    public changeDetectorRef: ChangeDetectorRef,
  ) { }

  ngOnInit() {
    this.ios = this.config.get('mode') === 'ios';
    this.user.getScheduleFilters().then(filters => {
      this.excludeTracks = filters;
    });

    // Subscribe to favorites changes via an RxJS Subscription
    this.favoritesSubscription = this.user.favoritesChanged$.subscribe(() => {
      this.updateSchedule();
      this.changeDetectorRef.detectChanges();
    });

    this.currentTime = new Date();
    this.dayIndex = "0";
    this.confData.getDays(this.excludeTracks, this.segment).subscribe((data: any) => {
      const offset = environment.utcOffset;
      const localDate = new Date(this.currentTime.getTime() + (offset * 3600 * 1000));
      const todayISO = localDate.toISOString().split('T')[0];
      var currDay = data.filter(d => d.date === todayISO);
      if (currDay.length > 0) {
        this.dayIndex = currDay[0].index;
        this.todayIndex = currDay[0].index;
      }
      this.reloadSchedule();
    });
  }

  ngOnDestroy() {
    if (this.favoritesSubscription) {
      this.favoritesSubscription.unsubscribe();
    }
  }

  ionViewWillEnter() {
    this.updateSchedule();
  }

  ionViewDidEnter() {
    this.changeDetectorRef.detectChanges();
    this.jumpBtnCollapsed = false;
    setTimeout(() => { this.jumpBtnCollapsed = true; }, 3000);
    if (this.dayIndex === this.todayIndex) {
      this.scrollToCurrentTime();
    }
  }

  jumpToNow() {
    if (this.dayIndex !== this.todayIndex) {
      this.dayIndex = this.todayIndex;
      this.updateSchedule();
    }
    setTimeout(() => this.scrollToCurrentTime(), 300);
  }

  scrollToCurrentTime() {
    setTimeout(() => {
      const futureEl = document.querySelector('.future') as HTMLElement;
      if (futureEl && this.content) {
        const rect = futureEl.getBoundingClientRect();
        this.content.getScrollElement().then((scrollEl) => {
          const scrollTop = scrollEl.scrollTop + rect.top - 100;
          this.content.scrollToPoint(0, scrollTop, 500);
        });
      }
    }, 500);
  }

  async handleRefresh(event) {
    this.reloadSchedule(true).then(() => {
      setTimeout(() => {
        event.target.complete();
      }, 250);
    });
  }

  updateSchedule() {
    this.searchedAllDays = false;
    this.allDaysMode = false;

    // Close any open sliding items when the schedule updates
    if (this.scheduleList) {
      this.scheduleList.closeSlidingItems();
    }

    this.confData.getDays(this.excludeTracks, this.segment).subscribe((data: any) => {
      this.days = data;
    });

    this.confData.getTimeline(this.dayIndex, this.queryText, this.excludeTracks, this.segment).subscribe((data: any) => {
      this.shownSessions = data.shownSessions;
      this.groups = data.groups;
      this.hasData = true;

      if (this.segment === 'favorites' && this.shownSessions === 0) {
        this.checkFavoritesOnOtherDays();
      } else {
        this.hasFavoritesOnOtherDays = false;
      }
    });

    this.changeDetectorRef.detectChanges();
  }

  async reloadSchedule(showLoader = false) {
    console.log('fetching schedule');

    // Close any open sliding items when the schedule updates
    if (this.scheduleList) {
      this.scheduleList.closeSlidingItems();
    }

    let loader;
    if (showLoader) {
      loader = await this.loadingCtrl.create({
        message: 'Fetching latest schedule...',
        duration: 10000,
      });
      await loader.present();
    }

    this.confData.getDays(this.excludeTracks, this.segment).subscribe((data: any) => {
      this.days = data;
    });

    this.confData.getTimeline(this.dayIndex, this.queryText, this.excludeTracks, this.segment).subscribe((data: any) => {
      this.shownSessions = data.shownSessions;
      this.groups = data.groups;
      this.hasData = true;
      if (loader) {
        loader.dismiss();
      }
    });
  }

  toggleFavorites() {
    this.segment = this.segment === 'favorites' ? 'all' : 'favorites';
    this.updateSchedule();
  }

  checkFavoritesOnOtherDays() {
    this.hasFavoritesOnOtherDays = false;
    for (let i = 0; i < this.days.length; i++) {
      if (String(i) === this.dayIndex) continue;
      this.confData.getTimeline(String(i), '', this.excludeTracks, 'favorites').subscribe((data: any) => {
        if (data.shownSessions > 0) {
          this.hasFavoritesOnOtherDays = true;
          this.changeDetectorRef.detectChanges();
        }
      });
    }
  }

  showAllFavorites() {
    this.allDaysMode = true;
    this.confData.getAllDaysTimeline(this.queryText, this.excludeTracks, 'favorites').subscribe((data: any) => {
      this.shownSessions = data.shownSessions;
      this.groups = data.groups;
      this.hasFavoritesOnOtherDays = false;
      this.changeDetectorRef.detectChanges();
    });
  }

  searchAllDays() {
    let found = false;
    let checked = 0;
    for (let i = 0; i < this.days.length; i++) {
      this.confData.getTimeline(String(i), this.queryText, this.excludeTracks, this.segment).subscribe((data: any) => {
        checked++;
        if (data.shownSessions > 0 && !found) {
          found = true;
          this.dayIndex = String(i);
          this.shownSessions = data.shownSessions;
          this.groups = data.groups;
          this.searchedAllDays = false;
          this.changeDetectorRef.detectChanges();
        }
        if (checked === this.days.length && !found) {
          this.searchedAllDays = true;
          this.changeDetectorRef.detectChanges();
        }
      });
    }
  }

  async focusButton() {
    setTimeout(() => {
      this.search.setFocus();
    }, 500); // ms delay
  }

  async presentFilter() {
    const modal = await this.modalCtrl.create({
      component: ScheduleFilterPage,
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: { excludedTracks: this.excludeTracks }
    });
    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (data) {
      this.excludeTracks = data;
      this.updateSchedule();
    }
  }

  async addFavorite(slidingItem: HTMLIonItemSlidingElement, sessionData: any) {
    // Add as a favorite
    this.user.addFavorite(sessionData.id);

    // Close the open item
    slidingItem.close();

    // Create a toast
    const toast = await this.toastCtrl.create({
      header: `${sessionData.name} was successfully added as a favorite.`,
      duration: 3000,
      buttons: [{
        text: 'Close',
        role: 'cancel'
      }]
    });

    // Present the toast at the bottom of the page
    await toast.present();
  }

  async removeFavorite(slidingItem: HTMLIonItemSlidingElement, sessionData: any) {
    // Remove from favorites
    this.user.removeFavorite(sessionData.id);

    // Close the open item
    slidingItem.close();

    // Create a toast
    const toast = await this.toastCtrl.create({
      header: `${sessionData.name} was successfully removed from favorites.`,
      duration: 3000,
      buttons: [{
        text: 'Close',
        role: 'cancel'
      }]
    });

    // Present the toast at the bottom of the page
    await toast.present();
  }

  async openSocial(network: string, fab: HTMLIonFabElement) {
    const loading = await this.loadingCtrl.create({
      message: `Posting to ${network}`,
      duration: (Math.random() * 1000) + 500
    });
    await loading.present();
    await loading.onWillDismiss();
    fab.close();
  }
}
