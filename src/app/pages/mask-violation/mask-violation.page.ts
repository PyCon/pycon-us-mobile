import { Component, ElementRef, ChangeDetectorRef, Inject, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { Config, Platform } from '@ionic/angular';
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

  constructor(
    public platform: Platform,
    private config: Config,
    private pycon: PyConAPI,
    private storage: Storage,
    public detectorRef: ChangeDetectorRef,
  ) { }

  updateLastScan = async (accessCode: string) => {
    this.pycon.captureMaskViolation(accessCode).then((data) => {
      data.subscribe(violationData => {
        this.violationData = violationData;
        this.detectorRef.detectChanges();
      })
    })
    this.last_scan_timeout = setTimeout(this.clearLastScan, 5000);
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
  }

  ngOnDestroy(): void {
    this.stopScan();
  }
}
