import { Component, ChangeDetectorRef, ViewChild, OnInit } from '@angular/core';
import { ConferenceData } from '../../providers/conference-data';
import { ActivatedRoute } from '@angular/router';
import { Config, IonContent, InfiniteScrollCustomEvent, LoadingController } from '@ionic/angular';
import { InAppBrowser, DefaultWebViewOptions } from '@capacitor/inappbrowser';
import { LiveUpdateService } from '../../providers/live-update.service';
import { UserData } from '../../providers/user-data';
import { environment } from '../../../environments/environment';

const slugify = str =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

@Component({
  selector: 'app-schedule-list',
  templateUrl: './schedule-list.page.html',
  styleUrls: ['./schedule-list.page.scss'],
})
export class ScheduleListPage implements OnInit {
  // Get a reference to the search bar
  @ViewChild('search') search : any;
  @ViewChild(IonContent) content: IonContent;
  showTitle = false;
  trackName: string;
  trackSlug: string;
  excludeTracks: any[] = [];

  sessions: any[] = [];
  displaySessions: any[] = [];
  sessionsByDay: any = {};
  dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Days that actually have sessions in the current view, in canonical order.
  // Drives the day-separator headers on the track list.
  visibleDays: string[] = [];
  sessionQueryText = '';
  isOpenSpaceView = false;

  private readonly dayLongLabels: Record<string, string> = {
    Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
    Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
  };

  dayLabel(day: string): string {
    return this.dayLongLabels[day] || day;
  }

  loggedIn: boolean = false;
  ios: boolean;
  showSearchbar: boolean;
  page: number = 0;
  scrolling: boolean = false;

  constructor(
    public confData: ConferenceData,
    public config: Config,
    private changeDetectorRef: ChangeDetectorRef,
    private loadingCtrl: LoadingController,
    private route: ActivatedRoute,
    public liveUpdateService: LiveUpdateService,
    private userData: UserData,
  ) { }


  onScroll(event: any) {
    this.showTitle = event.detail.scrollTop > 100;
  }

  updateSessions() {
    this.confData.getSessions(this.sessionQueryText, this.excludeTracks).subscribe((sessions: any[]) => {
      this.sessions = sessions;
      this.generateSessions();
    });
  }

  searchSessions() {
    this.scrolling = false;
    this.displaySessions = [];
    this.confData.getSessions(this.sessionQueryText, this.excludeTracks).subscribe((sessions: any[]) => {
      this.displaySessions = sessions;
      this.organizeSessionsByDay();
    });
  }

  resetSessions() {
    this.page = 0;
    this.scrolling = true;
    this.sessionQueryText = "";
    this.sessions = [];
    this.displaySessions = [];
    this.sessionsByDay = {};
    this.reloadSessions();
  }

  async favoriteAll() {
    const sessions = this.displaySessions?.filter(s => !s.hide && s.id) || [];
    const ids = sessions.map(s => String(s.id));
    await this.userData.addFavorites(ids);
    this.changeDetectorRef.detectChanges();
  }

  organizeSessionsByDay() {
    this.sessionsByDay = {};
    this.dayOrder.forEach(day => this.sessionsByDay[day] = []);

    this.displaySessions.forEach(session => {
      const bucket = this.sessionsByDay[session.day];
      if (bucket) {
        bucket.push(session);
      } else {
        // Unknown day code — keep the session findable rather than silently dropping it.
        this.sessionsByDay[session.day] = [session];
      }
    });

    this.visibleDays = Object.keys(this.sessionsByDay).filter(
      day => this.sessionsByDay[day]?.length > 0,
    );
    this.visibleDays.sort((a, b) => {
      const ai = this.dayOrder.indexOf(a);
      const bi = this.dayOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  async generateSessions() {
    if (this.page >= 0) {
      this.sessions.slice(25*this.page, 25*this.page + 25).forEach(session => this.displaySessions.push(session));
      if (this.sessions.length == this.displaySessions.length) {
        this.page = -1
        this.scrolling = false;
      } else {
        this.page += 1;
        this.scrolling = true;
      }
      this.organizeSessionsByDay();
    }
  }

  onIonInfinite(ev) {
    this.generateSessions().then(() => {
      setTimeout(() => {(ev as InfiniteScrollCustomEvent).target.complete()}, 200);
    });
  }

  reloadSessions() {
    this.scrolling = false;
    console.log('fetching sessions');
    this.loadingCtrl.create({
      message: 'Fetching latest sessions...',
      duration: 10000,
    }).then((loader) => {
      loader.present();
      this.displaySessions = [];
      this.confData.getSessions(this.sessionQueryText, this.excludeTracks).subscribe((sessions: any[]) => {
        // Belt-and-suspenders: on the open-spaces page, restrict to
        // sessions whose track is literally 'Open Space'. The
        // excludeTracks filter already does this in theory, but if the
        // initial async ordering ever gets restored (or a session has a
        // missing/empty `tracks` array) we don't want posters leaking
        // back onto this page. Equivalent guard for any other view that
        // expects only one track is left for future cleanup.
        if (this.isOpenSpaceView) {
          sessions = sessions.filter(
            (s: any) => s?.track === 'Open Space' || s?.tracks?.includes('Open Space'),
          );
        }
        this.sessions = sessions;
        this.generateSessions();
        setTimeout(() => {loader.dismiss()}, 100);
      });
    });
  }

  async focusButton() {
     setTimeout(() => {
       this.search.setFocus();
     }, 500); // ms delay
   }

  ionViewWillLeave() {
    console.log('here');
  }

  initSchedule(slug) {
    this.trackSlug = slug
    this.trackName = ""
    this.excludeTracks = []
    this.isOpenSpaceView = slug === 'open-spaces';

    this.confData.load().subscribe((data: any) => {
      if (data.sessions) {
        // Build excludeTracks BEFORE fetching the filtered session list.
        // Previously resetSessions() ran outside this subscribe, so by the
        // time the filter executed excludeTracks was still empty and
        // every session leaked through (e.g. posters showing on the
        // open-spaces page). Move resetSessions inside so the filter
        // sees a populated excludeTracks. PYMOBIL-bug.
        this.confData.getTracks().subscribe((tracks: any[]) => {
          tracks.forEach((track, index, arr) => {
            const trackNameToCompare = typeof track === 'string' ? track : track.name;
            if (slugify(trackNameToCompare + (typeof track === 'string' ? '' : 's')) !== this.trackSlug) {
              this.excludeTracks.push(trackNameToCompare);
            } else {
              this.trackName = trackNameToCompare;
            }
          })
          // Open-space sessions now expose 'Open Space' as their track
          // (matching the filter modal's display name) — the legacy
          // 'open-space' slug is no longer in session.tracks. Just toggle
          // the display name in/out of excludeTracks based on which list
          // we're viewing.
          if (slug !== 'open-spaces') {
            if (!this.excludeTracks.includes('Open Space')) {
              this.excludeTracks.push('Open Space');
            }
          } else {
            const i = this.excludeTracks.indexOf('Open Space');
            if (i > -1) {
              this.excludeTracks.splice(i, 1);
            }
          }
          this.resetSessions();
        });
      }
    });
  }

  submitOpenSpace() {
    window.open(`${environment.baseUrl}/2026/signup/open-space/`, '_system', 'location=yes');
  }

  ngOnInit() {
    this.ios = this.config.get('mode') === 'ios';
    this.userData.isLoggedIn().then((resp) => {
      this.loggedIn = resp;
    });
    window.addEventListener('user:login', () => {
      this.loggedIn = true;
      this.changeDetectorRef.detectChanges();
    });
    window.addEventListener('user:logout', () => {
      this.loggedIn = false;
      this.changeDetectorRef.detectChanges();
    });

    this.route.params.subscribe(routeParams => {
      console.log(routeParams);
      this.initSchedule(routeParams.trackSlug);
    });
  }
}
