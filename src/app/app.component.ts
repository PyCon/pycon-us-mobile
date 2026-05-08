import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { MenuController, Platform, ToastController } from '@ionic/angular';

import { SplashScreen } from '@capacitor/splash-screen';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

import { Storage } from '@ionic/storage-angular';

import { UserData, ThemeMode } from './providers/user-data';
import { ConferenceData } from './providers/conference-data';
import { LiveUpdateService } from './providers/live-update.service';
import { NotificationsService } from './providers/notifications.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class AppComponent implements OnInit {
  schedulePages = [
    { title: 'Schedule',  url: '/app/tabs/schedule',         icon: 'calendar-outline' },
    { title: 'Speakers',  url: '/app/tabs/speakers',         icon: 'people-outline' },
    { title: 'Keynote Speakers', url: '/app/tabs/keynote-speakers', icon: 'star-outline' },
    { title: 'Rooms',     url: '/app/tabs/rooms',            icon: 'pin-outline' },
  ]
  presentationPages = [
    { title: 'Talks',     group: 'presentations', url: '/app/tabs/tracks/talks',     icon: 'mic-outline'},
    { title: 'Keynotes',  group: 'presentations', url: '/app/tabs/tracks/keynotes',  icon: 'star-outline'},
    { title: 'AI',        group: 'presentations', url: '/app/tabs/tracks/ais',       icon: 'hardware-chip-outline'},
    { title: 'Security',  group: 'presentations', url: '/app/tabs/tracks/securitys', icon: 'shield-checkmark-outline'},
    { title: 'Charlas',   group: 'presentations', url: '/app/tabs/tracks/charlas',   icon: 'chatbubbles-outline'},
    { title: 'Lightning Talks', group: 'presentations', url: '/app/tabs/tracks/lightning-talkss', icon: 'flash-outline'},
    { title: 'Tutorials', group: 'presentations', url: '/app/tabs/tracks/tutorials', icon: 'book-outline'},
    { title: 'Posters',   group: 'presentations', url: '/app/tabs/tracks/posters',   icon: 'easel-outline'},
    { title: 'Sponsor Presentations', url: '/app/tabs/tracks/sponsor-presentations', icon: 'briefcase-outline'},
  ]
  conferencePages = [
    { title: 'Open Spaces', url: '/app/tabs/tracks/open-spaces', icon: 'people-circle-outline' },
    { title: 'Lightning Talks', url: '/app/tabs/lightning-talks', icon: 'flash-outline' },
    { title: 'Sprints', url: '/app/tabs/sprints', icon: 'rocket-outline' },
  ]
  expoPages = [
    { title: 'Sponsors', url: '/app/tabs/sponsors', icon: 'business-outline' },
    { title: 'Expo Hall', url: '/app/tabs/expo-hall', icon: 'storefront-outline' },
    { title: 'Job Listings', url: '/app/tabs/job-listings', icon: 'briefcase-outline' },
  ]
  aboutPages = [
    { title: 'Conference Info', url: '/app/tabs/about-pycon', icon: 'information-circle-outline' },
    { title: 'Code of Conduct', url: '/app/tabs/coc', icon: 'shield-checkmark-outline' },
    { title: 'Wi-Fi', url: '/app/tabs/wifi', icon: 'wifi-outline' },
    { title: 'Venue & Hours', url: '/app/tabs/venues-hours', icon: 'location-outline' },
    { title: 'Session Types', url: '/app/tabs/session-types', icon: 'pricetags-outline' },
  ]
  infoPages = [
    { title: 'About The PSF', url: '/app/tabs/about-psf', icon: 'logo-python' },
    { title: 'Social', url: '/app/tabs/social-media', icon: 'chatbubbles-outline' },
    { title: 'Conference Maps', url: '/app/tabs/conference-map', icon: 'map-outline' },
    { title: 'Help & Safety', url: '/app/tabs/help', icon: 'help-circle-outline' },
  ]
  nickname = null;
  loggedIn = false;
  theme: ThemeMode = 'light';

  updateAvailable: any = null;

  hasApps = false;
  hasLeadRetrieval = false;
  hasDoorCheck= false;
  hasMaskViolation = false;
  isDev = !environment.production;
  environmentUrl = environment.baseUrl;

  constructor(
    private menu: MenuController,
    private platform: Platform,
    private router: Router,
    private storage: Storage,
    private userData: UserData,
    private toastCtrl: ToastController,
    public confData: ConferenceData,
    public liveUpdateService: LiveUpdateService,
    public notifications: NotificationsService,
  ) {
    this.storage.create();
    this.initializeApp();
  }

  async ngOnInit() {
    this.loadTheme();
    this.checkLoginStatus();
    this.listenForLoginEvents();
    this.fetchFeatures();

    // Defer non-critical work until after first render
    setTimeout(() => {
      this.checkNotifications();
      this.liveUpdateService.checkForUpdate();
      // Load saved prefs and (re)schedule local sign-up reminders. Re-runs
      // every cold start so missed/expired reminders get cleaned up and
      // anything still in the future gets re-armed.
      this.notifications.getPrefs().then(() => this.notifications.applyPrefs());
    }, 5000);
  }

  checkNotifications() {
    // Single-stack push: @capacitor-firebase/messaging owns APNs/FCM
    // registration, topic subscription, and foreground delivery. The
    // older @capacitor/push-notifications plugin was removed because
    // Capawesome explicitly warns the two cannot coexist (duplicate
    // APNs swizzling, conflicting FirebaseMessagingService receivers).
    FirebaseMessaging.addListener('tokenReceived', (event) => {
      console.info('Registration token: ', event.token);
    });
    FirebaseMessaging.requestPermissions().then((result) => {
      if (result.receive !== 'granted') return;
      // Calling getToken() also triggers APNs registration on iOS, so
      // we don't need a separate register() step.
      FirebaseMessaging.getToken().catch((err) => {
        console.warn('FirebaseMessaging.getToken failed', err);
      });
    });
    FirebaseMessaging.addListener('notificationReceived', async (event) => {
      // FCM pushes (emergency, announcements, schedule changes) — the
      // toggle in Settings opts the device out of the underlying topic
      // so users who turn a category off don't receive the push at all.
      // This check is a defense in case staff send to all devices
      // instead of a topic.
      if (!this.notifications.shouldShowPushBanner()) return;
      const notification = event?.notification;
      const title = notification?.title ?? 'PyCon US';
      const body = notification?.body ?? '';
      this.toastCtrl.create({
        message: body ? `${title}: ${body}` : title,
        position: 'top',
        buttons: [{
          icon: 'close',
          side: 'end',
          role: 'cancel',
        }],
      }).then((toast) => toast.present());
    });
  }

  initializeApp() {
    this.confData.load().subscribe({
      next: () => {
        if (this.platform.is('hybrid')) {
          SplashScreen.hide();
        }
      },
      error: () => {
        // Hide splash even on error so user isn't stuck
        if (this.platform.is('hybrid')) {
          SplashScreen.hide();
        }
      }
    });
  }

  checkLoginStatus() {
    this.userData.isLoggedIn().then(loggedIn => {
      this.updateLoggedInStatus(loggedIn);
      if (loggedIn) {
        this.userData.fetchPreferences();
      }
    });
  }

  fetchFeatures() {
    this.userData.isLoggedIn().then(loggedIn => {
      if (loggedIn) {
        this.userData.fetchFeatures();
        this.updateLoggedInStatus(loggedIn);
      }
    });
  }

  updateLoggedInStatus(loggedIn: boolean) {
    setTimeout(() => {
      this.loggedIn = loggedIn;
      this.userData.fetchPreferences();
      this.userData.checkHasLeadRetrieval().then(hasLeadRetrieval => {
        this.hasApps = this.hasApps || hasLeadRetrieval;
        this.hasLeadRetrieval = hasLeadRetrieval;
      });
      this.userData.checkHasDoorCheck().then(hasDoorCheck => {
        this.hasApps = this.hasApps || hasDoorCheck;
        this.hasDoorCheck = hasDoorCheck;
      });
      this.userData.checkHasMaskViolation().then(hasMaskViolation => {
        this.hasApps = this.hasApps || hasMaskViolation;
        this.hasMaskViolation = hasMaskViolation;
      });
      this.userData.getNickname().then(nickname => {
        this.nickname = nickname;
      });
    }, 300);
  }

  listenForLoginEvents() {
    window.addEventListener('user:login', () => {
      this.updateLoggedInStatus(true);
    });

    window.addEventListener('user:logout', () => {
      this.updateLoggedInStatus(false);
    });
  }

  logout() {
    this.userData.logout().then(() => {
      this.hasApps = false;
      this.hasLeadRetrieval = false;
      this.hasDoorCheck = false;
      this.hasMaskViolation = false;
      return this.router.navigateByUrl('/app/tabs/schedule');
    });
  }

  openTutorial() {
    this.menu.enable(false);
    this.storage.set('ion_did_tutorial', false);
    this.router.navigateByUrl('/tutorial');
  }

  loadTheme() {
    this.userData.getTheme().then(theme => {
      this.theme = theme;
    });
  }

  setTheme(theme: ThemeMode) {
    this.theme = theme;
    this.userData.setTheme(theme);
  }

  openUrl(url: string) {
    window.open(url, '_system', 'location=yes');
  }

}
