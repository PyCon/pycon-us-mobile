import { Component, ElementRef, ChangeDetectorRef, Inject, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { AlertController, Config, Platform } from '@ionic/angular';
import { BarcodeScanner, BarcodeFormat, LensFacing, ScanResult } from '@capacitor-mlkit/barcode-scanning';
import { Storage } from '@ionic/storage-angular';

import { PyConAPI } from '../../providers/pycon-api';

@Component({
  selector: 'app-mask-violation',
  templateUrl: './mask-violation.page.html',
  styleUrls: ['./mask-violation.page.scss'],
})
export class MaskViolationPage implements OnInit, OnDestroy {
  // Single source of truth for scanner state. The template binds
  // visibility, button label, and color directly off this — replaces
  // the trio of *_visibility = 'show'|'hidden' string flags from the
  // older page that didn't survive lifecycle transitions cleanly.
  scanning = false;
  scan_presentation = [];
  dirty: boolean = false;

  last_scan_timeout: ReturnType<typeof setTimeout> = null;
  scan_timeout: ReturnType<typeof setTimeout> = null;
  ignore_scans: boolean = false;

  ios: boolean;
  show_permissions_error: boolean = false;

  violationData: any = null;

  // Name-search fallback for when scanning a badge isn't an option.
  // We pull the full attendee directory once and filter client-side; selecting
  // a row reuses the same captureMaskViolation flow as a real scan so the
  // server side stays unchanged.
  attendees: any[] = [];
  filteredAttendees: any[] = [];
  searchQuery: string = '';
  attendeesLoading: boolean = false;
  attendeesError: boolean = false;
  capturing: boolean = false;

  constructor(
    public platform: Platform,
    private config: Config,
    private pycon: PyConAPI,
    private storage: Storage,
    public detectorRef: ChangeDetectorRef,
    private alertCtrl: AlertController,
  ) { }

  updateLastScan = async (accessCode: string, options?: {notes?: string; force?: boolean}) => {
    this.capturing = true;
    this.pycon.captureMaskViolation(accessCode, options).then((data) => {
      data.subscribe({
        next: violationData => {
          this.violationData = violationData;
          this.capturing = false;
          // Refresh the in-memory directory so the incident count
          // for this attendee stays accurate without a full reload.
          const next = violationData?.data?.violations;
          if (typeof next === 'number') {
            const row = this.attendees.find(a => a.access_code === accessCode);
            if (row) {
              row.violations = next;
              this.applyFilter();
            }
          }
          this.detectorRef.detectChanges();
        },
        error: () => {
          this.capturing = false;
          this.detectorRef.detectChanges();
        },
      })
    }).catch(() => {
      this.capturing = false;
      this.detectorRef.detectChanges();
    });
    this.last_scan_timeout = setTimeout(this.clearLastScan, 5000);
  }

  loadAttendees = async () => {
    this.attendeesLoading = true;
    this.attendeesError = false;
    try {
      const observable = await this.pycon.fetchCocAttendees();
      observable.subscribe({
        next: (resp: any) => {
          this.attendees = (resp?.data || []).slice().sort((a: any, b: any) => {
            const aName = (a.full_name || a.nickname || a.badge_name || '').toLowerCase();
            const bName = (b.full_name || b.nickname || b.badge_name || '').toLowerCase();
            return aName.localeCompare(bName);
          });
          this.attendeesLoading = false;
          this.applyFilter();
          this.detectorRef.detectChanges();
        },
        error: () => {
          this.attendeesLoading = false;
          this.attendeesError = true;
          this.detectorRef.detectChanges();
        },
      });
    } catch {
      this.attendeesLoading = false;
      this.attendeesError = true;
      this.detectorRef.detectChanges();
    }
  }

  onSearchInput = (event: any) => {
    this.searchQuery = (event?.detail?.value || '').trim();
    this.applyFilter();
  }

  applyFilter = () => {
    const q = this.searchQuery.toLowerCase();
    if (!q) {
      this.filteredAttendees = [];
      return;
    }
    const terms = q.split(/\s+/).filter(Boolean);
    this.filteredAttendees = this.attendees
      .filter(a => {
        const haystack = [
          a.full_name || '',
          a.nickname || '',
          a.badge_name || '',
        ].join(' ').toLowerCase();
        return terms.every(t => haystack.includes(t));
      })
      .slice(0, 25);
  }

  selectAttendee = async (attendee: any) => {
    if (this.capturing || !attendee?.access_code) return;

    const displayName = attendee.full_name || attendee.nickname || attendee.badge_name || 'this attendee';
    const lines: string[] = [];
    if (attendee.badge_name && attendee.badge_name !== displayName) {
      lines.push(`Badge: ${attendee.badge_name}`);
    }
    const count = attendee.violations ?? 0;
    lines.push(`Existing incidents: ${count}`);
    lines.push('');
    lines.push('Add any context (location, what happened, witnesses). This is saved on the incident record.');

    const alert = await this.alertCtrl.create({
      header: 'Record CoC Incident',
      subHeader: displayName,
      message: lines.join('\n'),
      backdropDismiss: false,
      cssClass: 'coc-confirm-alert',
      inputs: [
        {
          name: 'notes',
          type: 'textarea',
          placeholder: 'Notes (optional)',
          attributes: {
            rows: 4,
            maxlength: 2000,
            autocapitalize: 'sentences',
          },
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Record Incident',
          role: 'confirm',
          handler: (values) => {
            clearTimeout(this.last_scan_timeout);
            const notes = (values?.notes || '').toString().trim();
            this.updateLastScan(attendee.access_code, {notes, force: true});
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  checkPermission = async () => {
    try {
      const status = await BarcodeScanner.checkPermissions();
      if (status) {
        return true;
      }
      await BarcodeScanner.requestPermissions();
    } catch(e) {
      console.log(e);
    }
  }

  clearLastScan = async () => {
    this.violationData = null;
    this.detectorRef.detectChanges();
  }

  handleScan = async (result: any) => {  // Should be type ScanResult or BarcodeScannedEvent???
    if (result.barcodes && !this.ignore_scans) {
      clearTimeout(this.last_scan_timeout);
      this.updateLastScan(result.barcodes[0].rawValue.split(':')[0]);
    }
  }

  startScan = async () => {
    const permission = await this.checkPermission();
    if (!permission) {
      this.show_permissions_error = true;
      return;
    }
    this.show_permissions_error = false;
    this.scanning = true;
    await BarcodeScanner.addListener(
      'barcodesScanned',
      async result => {
        this.handleScan(result);
      },
    );
    BarcodeScanner.startScan({
      formats: [BarcodeFormat.QrCode],
      lensFacing: LensFacing.Back,
    });
  };

  stopScan = async () => {
    this.violationData = null;
    clearTimeout(this.scan_timeout);
    await BarcodeScanner.removeAllListeners();
    await BarcodeScanner.stopScan();
    this.scanning = false;
  }

  ionViewWillLeave() {
    this.stopScan();
  }

  ngOnInit(): void {
    this.ios = this.config.get('mode') === `ios`;
    this.loadAttendees();
  }

  ngOnDestroy(): void {
    this.stopScan();
  }
}
