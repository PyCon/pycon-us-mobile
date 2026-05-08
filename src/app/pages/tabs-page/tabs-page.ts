import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { ConferenceData } from '../../providers/conference-data';
import { UserData } from '../../providers/user-data';

@Component({
  templateUrl: 'tabs-page.html',
  styleUrls: ['tabs-page.scss'],
})
export class TabsPage implements OnInit {
  sponsors: any = [];
  currentBannerSponsor: any;
  hasLeadRetrieval: boolean = false;
  hasDoorCheck: boolean = false;
  hasMaskViolation: boolean = false;
  loggedIn: boolean = false;
  showStaffTools: boolean = false;
  activeTab: string = '';

  constructor(
    private userData: UserData,
    private confData: ConferenceData,
    private modalCtrl: ModalController,
    private router: Router,
  ) {}

  async ngOnInit() {
    this.reloadSponsors();
    this.checkHasLeadRetrieval();
    this.checkHasDoorCheck();
    this.checkHasMaskViolation();
    this.checkLoggedIn();
    this.listenForLoginEvents();
    setInterval(this.showSponsorBanner, 30000);

    this.activeTab = this.computeActiveTab(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.activeTab = this.computeActiveTab(e.urlAfterRedirects);
      });
  }

  private computeActiveTab(url: string): string {
    const match = url.match(/\/app\/tabs\/([^/?#]+)/);
    return match ? match[1] : '';
  }

  checkLoggedIn() {
    this.userData.isLoggedIn().then(loggedIn => {
      this.loggedIn = loggedIn;
    });
  }

  openStaffTools(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.showStaffTools = true;
  }

  goToTool(path: string) {
    this.showStaffTools = false;
    this.router.navigateByUrl(path);
  }

  showSponsorBanner() {
    var hidden = document.getElementsByClassName('bannerSponsorHidden');
    var visible = document.getElementsByClassName('bannerSponsorVisible');
    Array.from(visible).forEach((banner, index, array) => {
      banner.classList.remove('bannerSponsorVisible');
      banner.classList.add('bannerSponsorHidden');
    });
    var newBanner = hidden.item(hidden.length * Math.random() | 0);
    if (newBanner) {
      newBanner.classList.remove('bannerSponsorHidden');
      newBanner.classList.add('bannerSponsorVisible');
    }
  }

  reloadSponsors() {
    this.confData.getSponsors().subscribe((sponsors: any[]) => {
      const bannerSponsors = [];
      for (const [level, levelSponsors] of Object.entries(sponsors)) {
        levelSponsors.forEach(function(sponsor, index, arr) {
          if (sponsor.mobile_banner) {
            bannerSponsors.push(sponsor);
          }
        });
      }
      this.sponsors = bannerSponsors;
      setTimeout(this.showSponsorBanner, 100);
    });
  }

  checkHasLeadRetrieval() {
    return this.userData.checkHasLeadRetrieval().then(hasLeadRetrieval => {
      return this.updateHasLeadRetrieval(hasLeadRetrieval);
    });
  }

  updateHasLeadRetrieval(hasLeadRetrieval: boolean) {
    setTimeout(() => {
      this.hasLeadRetrieval = hasLeadRetrieval;
    }, 200)
  }

  checkHasDoorCheck() {
    return this.userData.checkHasDoorCheck().then(hasDoorCheck => {
      return this.updateHasDoorCheck(hasDoorCheck);
    });
  }

  updateHasDoorCheck(hasDoorCheck: boolean) {
    setTimeout(() => {
      this.hasDoorCheck = hasDoorCheck;
    }, 200)
  }

  checkHasMaskViolation() {
    return this.userData.checkHasMaskViolation().then(hasMaskViolation => {
      return this.updateHasMaskViolation(hasMaskViolation);
    });
  }

  updateHasMaskViolation(hasMaskViolation: boolean) {
    setTimeout(() => {
      this.hasMaskViolation = hasMaskViolation;
    }, 200)
  }

  goTo(path: string) {
    this.router.navigateByUrl(path);
  }

  goToSponsor(sponsor: any) {
    if (!sponsor?.name) return;
    const slug = String(sponsor.name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    this.router.navigateByUrl(`/app/tabs/sponsors/sponsor-detail/${slug}`);
  }

  listenForLoginEvents() {
    window.addEventListener('user:login', () => {
      this.checkHasLeadRetrieval();
      this.checkHasDoorCheck();
      this.checkLoggedIn();
    });

    window.addEventListener('user:logout', () => {
      this.checkHasLeadRetrieval();
      this.checkHasDoorCheck();
      this.checkLoggedIn();
    });
  }
}
