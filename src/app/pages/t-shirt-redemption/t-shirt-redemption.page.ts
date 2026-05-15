import { Component, ElementRef, ChangeDetectorRef, Inject, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { Config, Platform, ToastController } from '@ionic/angular';
import { BarcodeScanner, BarcodeFormat, LensFacing, ScanResult } from '@capacitor-mlkit/barcode-scanning';
import { Storage } from '@ionic/storage-angular';
import { ModalController } from '@ionic/angular';

import { PyConAPI } from '../../providers/pycon-api';
import { LiveUpdateService } from '../../providers/live-update.service';
import { RedemptionModalComponent } from '../../redemption-modal/redemption-modal.component';


@Component({
  selector: 'app-t-shirt-redemption',
  templateUrl: './t-shirt-redemption.page.html',
  styleUrls: ['./t-shirt-redemption.page.scss'],
})
export class TShirtRedemptionPage implements OnInit, OnDestroy {
  scanning: boolean = false;
  scan_presentation = [];
  dirty: boolean = false;

  last_scan: any = null;
  last_scan_timeout: ReturnType<typeof setTimeout> = null;
  scanError: boolean = false;
  scan_timeout: ReturnType<typeof setTimeout> = null;
  ignore_scans: boolean = false;
  // Hard lock around the whole "scan -> fetch -> modal -> redeem -> resume"
  // pipeline. Belt-and-suspenders against duplicate scanner listeners
  // firing handleScan twice for a single barcode (previously caused
  // duplicate DoorCheck rows in prod).
  processing_scan: boolean = false;

  ios: boolean;
  show_permissions_error: boolean = false;

  mode: string|null = "redemption_mode";
  category: Array<number>|null = null;

  redeemable_products: any = null;
  redeemable_categories: any = null;
  display_products: any = null;

  product_attendees: any = null;

  constructor(
    public platform: Platform,
    private config: Config,
    private pycon: PyConAPI,
    private storage: Storage,
    public detectorRef: ChangeDetectorRef,
    public modalCtrl: ModalController,
    private toastCtrl: ToastController,
  ) { }

  private async showToast(message: string, color: 'success' | 'danger' | 'warning', duration = 3000) {
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration,
      position: 'top',
    });
    await toast.present();
  }

  getCategoryName(categoryId: number) {
    return this.redeemable_categories.find(x => x.id === categoryId)?.name
  }

  hasSelectedCategories(): boolean {
    return Array.isArray(this.category) && this.category.length > 0;
  }

  isCategorySelected(id: number): boolean {
    return Array.isArray(this.category) && this.category.includes(id);
  }

  toggleCategory(id: number) {
    if (!Array.isArray(this.category)) {
      this.category = [];
    }
    const idx = this.category.indexOf(id);
    if (idx > -1) {
      this.category.splice(idx, 1);
    } else {
      this.category.push(id);
    }
    if (this.category.length === 0) {
      this.category = null;
    }
    this.detectorRef.detectChanges();
  }

  selectedCategoryNames(): string {
    if (!this.hasSelectedCategories()) return '';
    return this.category!.map(id => this.getCategoryName(id)).filter(Boolean).join(', ');
  }

  updateLastScan = async (accessCode: string) => {
    this.last_scan = {
      "status": this.product_attendees.includes(accessCode),
      "code": accessCode
    };
    this.detectorRef.detectChanges();
    this.last_scan_timeout = setTimeout(this.clearLastScan, 5000);
  }

  checkPermission = async () => {
    try {
      const status = await BarcodeScanner.checkPermissions();
      if (status) {
        return true;
      }
      return false;
    } catch(e) {
      console.log(e);
    }
  }

  openRedemptionModal = async (redemptionData, scannedRawValue?: string, scannedAt?: string) => {
    clearTimeout(this.scan_timeout);
    this.ignore_scans = true;
    const modal = await this.modalCtrl.create({
      component: RedemptionModalComponent,
      componentProps: {
        accessCode: redemptionData.attendee_access_code,
        attendeeName: redemptionData.attendee_name,
        attendeeId: redemptionData.attendee_id,
        hasItemsToRedeem: redemptionData.has_items_to_redeem,
        redeemableProductsByCategory: redemptionData.redeemable_products_by_category,
      }
    })
    modal.present();

    const { data, role } = await modal.onWillDismiss();

    this.ignore_scans = false;
    if (role === 'save' && data) {
      const toRedeemEntries = Object.entries(data.toRedeem ?? {});
      if (toRedeemEntries.length === 0) {
        // Operator confirmed with nothing checked — bail out before
        // POSTing an empty redemption (which the backend silently accepts
        // as a no-op, leaving the operator wondering why nothing happened).
        await this.showToast('No items selected — nothing to redeem.', 'warning');
        this.processing_scan = false;
        if (this.scanning) await this.addListeners();
        return;
      }
      // The API view writes a DoorCheck row for every non-permanent
      // redemption (e.g. shirts). DoorCheck.scanned_at is a non-null
      // DateTimeField — if we omit `scanned_at` here the backend coerces
      // it to "" and the .save() 500s with `invalid input syntax for
      // type timestamp`. Same shape as door-check.page.ts:152.
      const validator = scannedRawValue ? (scannedRawValue.split(':')[1] ?? '') : '';
      const payload: any = {
        attendee_access_code: data.accessCode,
        badge_validator: validator,
        scanned_at: scannedAt ?? new Date().toISOString(),
      };
      for (const [key, value] of toRedeemEntries) {
        payload['product-redeem-' + key] = key;
        payload['product-' + key + '-quantity'] = value;
      }
      console.log(payload);
      try {
        const observable = await this.pycon.redeemProducts(payload);
        observable.subscribe(
          (redemptionData: any) => {
            console.log(redemptionData);
            const errors: any[] = redemptionData?.errors ?? [];
            const redeemed: any = redemptionData?.redeemable_products_by_category ?? {};
            const redeemedCount: number = Object.values(redeemed).reduce<number>(
              (n, items: any) => n + (Array.isArray(items) ? items.length : 0),
              0,
            );
            if (errors.length > 0) {
              const msg = errors.map((e) => e.message).filter(Boolean).join('; ') || 'Some items could not be redeemed.';
              this.showToast(`Partial redemption: ${msg}`, 'warning', 5000);
            } else if (redeemedCount > 0) {
              this.showToast(`Redeemed ${redeemedCount} item${redeemedCount === 1 ? '' : 's'}.`, 'success');
            } else {
              // Backend returned 200 but nothing actually redeemed — most
              // commonly an already-redeemed line item. Surface it so the
              // operator doesn't think the button is broken.
              this.showToast('Nothing was redeemed. Items may already be picked up.', 'warning');
            }
            this.processing_scan = false;
            if (this.scanning) this.addListeners();
          },
          (error: any) => {
            // Without this branch a network/5xx error vanished into the
            // RxJS unhandled-error log and the operator saw nothing
            // happen at all.
            console.warn('Redemption failed', error);
            this.showToast('Redemption failed — check WiFi and try again.', 'danger', 5000);
            this.processing_scan = false;
            if (this.scanning) this.addListeners();
          },
        );
      } catch (err) {
        console.warn('redeemProducts threw before subscribe', err);
        this.showToast('Redemption failed — check WiFi and try again.', 'danger', 5000);
        this.processing_scan = false;
        if (this.scanning) this.addListeners();
      }
    } else {
      // Modal was cancelled — resume scanning so the operator can move on.
      this.processing_scan = false;
      if (this.scanning) await this.addListeners();
    }
  }

  clearError = async () => {
    this.scanError = false;
    this.detectorRef.detectChanges();
  }

  clearLastScan = async () => {
    this.last_scan = null;
    this.detectorRef.detectChanges();
  }

  addListeners = async () => {
    // Drop any prior listener before subscribing — handleScan() is invoked
    // from a 250ms timer AND again after the redemption modal dismisses, so
    // without this each scan ends up wired twice and every barcode fires
    // handleScan twice (= double POST = potential duplicate redemption).
    await BarcodeScanner.removeAllListeners();
    await BarcodeScanner.addListener(
      'barcodesScanned',
      async result => {
        this.handleScan(result)
      },
    );
  }

  removeListeners = async () => {
    await BarcodeScanner.removeAllListeners();
  }

  handleScan = async (result: any) => {  // Should be type ScanResult or BarcodeScannedEvent???
    if (!result.barcodes || this.ignore_scans || this.processing_scan) return;
    // Take the lock SYNCHRONOUSLY before any awaits so a duplicate listener
    // firing the same tick can't slip past the guard.
    this.processing_scan = true;
    try {
      await this.removeListeners();
      clearTimeout(this.last_scan_timeout);
      // Capture rawValue + scan timestamp now so the redemption POST can
      // include badge_validator + scanned_at, matching the door-check
      // payload. Without these the backend's DoorCheck.save() 500s on an
      // empty DateTimeField and the redemption silently fails.
      const rawValue = result.barcodes[0].rawValue as string;
      const scannedAt = new Date().toISOString();
      const observable = await this.pycon.fetchAttendeeProducts(
        rawValue.split(':')[0], this.category, this.mode,
      );
      observable.subscribe(
        (redemptionData) => {
          if (redemptionData) {
            console.log(redemptionData);
            this.openRedemptionModal(redemptionData, rawValue, scannedAt);
          } else {
            this.processing_scan = false;
            if (this.scanning) this.addListeners();
          }
        },
        () => {
          this.scanError = true;
          this.detectorRef.detectChanges();
          this.processing_scan = false;
          if (this.scanning) this.addListeners();
        },
      );
      setTimeout(this.clearError, 1000);
    } catch (err) {
      console.warn('handleScan failed', err);
      this.processing_scan = false;
      if (this.scanning) this.addListeners();
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
    await this.addListeners();
    BarcodeScanner.startScan({
      formats: [BarcodeFormat.QrCode],
      lensFacing: LensFacing.Back
    });
  }

  stopScan = async () => {
    this.last_scan = null;
    clearTimeout(this.scan_timeout);
    await this.removeListeners();
    await BarcodeScanner.stopScan()
    this.scanning = false;
  }

  ionViewWillLeave() {
    this.stopScan();
  }

  ngOnInit(): void {
    this.ios = this.config.get('mode') === `ios`;
    this.pycon.fetchCheckInProducts().then((data) => {
      data.subscribe(redeemable => {
        // /check_in/redeemable/ returns the union of every redeemable
        // category (sessions + swag) and CategorySerializer omits
        // render_type, so we have to discriminate by name. Swag pickup
        // only redeems merch — keep T-Shirt categories (and any
        // future "swag-*" naming) and drop the rest. Long-term fix:
        // expose render_type on the API.
        const categories = (redeemable?.redeemable_categories ?? [])
          .filter(c => /shirt|swag/i.test(c?.name ?? ''));
        const keepIds = new Set(categories.map(c => c.id));
        this.redeemable_categories = categories;
        this.redeemable_products = (redeemable?.redeemable_products ?? [])
          .filter(p => keepIds.has(p.category));
      })
    })
  }

  ngOnDestroy(): void {
    this.stopScan();
  }
}
