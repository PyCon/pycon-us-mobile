import { Component, OnInit, ChangeDetectorRef, ViewChild } from '@angular/core';
import { IonContent } from '@ionic/angular';

import { ConferenceData } from '../../providers/conference-data';
import { UserData } from '../../providers/user-data';
import { LiveUpdateService } from '../../providers/live-update.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sprints',
  templateUrl: './sprints.page.html',
  styleUrls: ['./sprints.page.scss'],
})
export class SprintsPage implements OnInit {
  @ViewChild(IonContent) content: IonContent;
  showTitle = false;
  allSprints: any[] = [];
  sprints: any[] = [];
  searchText: string = '';
  loggedIn: boolean = false;

  constructor(
    private confData: ConferenceData,
    private userData: UserData,
    private changeDetection: ChangeDetectorRef,
    public liveUpdateService: LiveUpdateService,
  ) {}

  onScroll(event: any) {
    this.showTitle = event.detail.scrollTop > 100;
  }

  loadSprints() {
    this.confData.getSprints().subscribe((sprints: any[]) => {
      if (sprints.length > 0 || this.allSprints.length === 0) {
        this.allSprints = sprints;
        this.filterSprints();
        this.changeDetection.detectChanges();
      }
    });
  }

  doRefresh(event: any) {
    this.confData.invalidateCache();
    this.confData.getSprints().subscribe({
      next: (sprints: any[]) => {
        this.allSprints = sprints;
        this.filterSprints();
        this.changeDetection.detectChanges();
      },
      complete: () => {
        event.target.complete();
      }
    });
  }

  filterSprints() {
    if (!this.searchText.trim()) {
      this.sprints = this.allSprints;
      return;
    }
    const words = this.searchText.toLowerCase().replace(/,|\.|-/g, ' ').split(' ').filter(w => w.trim().length);
    this.sprints = this.allSprints.filter(sprint => {
      const haystack = `${sprint.name} ${sprint.submitter || ''} ${sprint.description_html || ''}`.toLowerCase();
      return words.every(word => haystack.includes(word));
    });
  }

  resetSearch() {
    this.searchText = '';
    this.sprints = this.allSprints;
  }

  submitSprint() {
    window.open(`${environment.baseUrl}/2026/sprints/project/submit/`, '_system', 'location=yes');
  }

  openSprintsPage() {
    window.open('https://us.pycon.org/2026/events/dev-sprints/', '_system', 'location=yes');
  }

  ngOnInit() {
    this.loadSprints();
    this.userData.isLoggedIn().then((resp) => {
      this.loggedIn = resp;
    });
    window.addEventListener('user:login', () => {
      this.loggedIn = true;
      this.changeDetection.detectChanges();
    });
    window.addEventListener('user:logout', () => {
      this.loggedIn = false;
      this.changeDetection.detectChanges();
    });
  }
}
