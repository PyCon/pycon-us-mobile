import { Component, ElementRef, ChangeDetectorRef, Inject, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { Config, Platform } from '@ionic/angular';
import { BarcodeScanner, BarcodeFormat, LensFacing, ScanResult } from '@capacitor-mlkit/barcode-scanning';
import { Storage } from '@ionic/storage-angular';

import { PyConAPI } from '../../providers/pycon-api';
import { LiveUpdateService } from '../../providers/live-update.service';

@Component({
  selector: 'app-door-check',
  templateUrl: './door-check.page.html',
  styleUrls: ['./door-check.page.scss'],
})
export class DoorCheckPage implements OnInit, OnDestroy {
  scanning: boolean = false;
  scan_presentation = [];
  dirty: boolean = false;
  // Running tally of successful, NOT-already-checked-in scans for the
  // current product. Resets when the operator picks a different product /
  // category, or restarts the scanner. Surfaced on the last-scan popup so
  // door staff can sanity-check headcount against badge stickers / clicker
  // counts without leaving the app.
  check_in_count: number = 0;

  last_scan: any = null;
  last_scan_timeout: ReturnType<typeof setTimeout> = null;
  scan_timeout: ReturnType<typeof setTimeout> = null;
  ignore_scans: boolean = false;

  ios: boolean;
  show_permissions_error: boolean = false;

  mode: string|null = "door_check";
  category: number|null = null;
  product: any = null;
  scanningProducts: [any] = null;

  redeemable_products: any = null;
  redeemable_categories: any = null;
  display_products: any = null;
  filtered_products: any = null;
  productSearch: string = '';

  product_attendees: Map<string, number>|null = null;
  inventory: Map<string, Map<number, number>>|null = null;

  constructor(
    public platform: Platform,
    private config: Config,
    private pycon: PyConAPI,
    private storage: Storage,
    public detectorRef: ChangeDetectorRef,
  ) { }

  filterProducts() {
    if (this.category) {
      return this.redeemable_products.filter(product => product.category === this.category);
    }
    return this.redeemable_products
  }

  getProductName(productId: number) {
    return this.redeemable_products.find(x => x.id === productId)?.name
  }

  getCategoryName(categoryId: number) {
    return this.redeemable_categories.find(x => x.id === categoryId)?.name
  }

  // Tutorial product names are prefixed with "<DayAbbr> <Mon> <DD> <H:MM> <AM|PM> - Title"
  // (e.g. "Wed May 13 9:00 AM - All about decorators"). A naive alphabetical
  // sort puts Fri before Thu before Wed and 1pm before 9am because '1' < '9'.
  // Pull the date/time out and sort chronologically; non-tutorial products
  // (t-shirts, swag) lack the prefix and fall through to alphabetical via
  // the tiebreaker.
  private static productSortKey(name: string): number {
    const m = name.match(/^(?:\w{3,9}\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s+(AM|PM)\b/i);
    if (!m) return Number.MAX_SAFE_INTEGER;
    const months: Record<string, number> = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const month = months[m[1].toLowerCase()] ?? 0;
    const day = parseInt(m[2], 10);
    let hour = parseInt(m[3], 10);
    const minute = parseInt(m[4], 10);
    const ampm = m[5].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return Date.UTC(2026, month, day, hour, minute);
  }

  refreshProducts() {
    this.display_products = this.filterProducts().sort((a, b) => {
      const ka = DoorCheckPage.productSortKey(a.name);
      const kb = DoorCheckPage.productSortKey(b.name);
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name);
    });
    this.filtered_products = this.display_products;
    this.productSearch = '';
    this.product = null;
    this.detectorRef.detectChanges();
  }

  selectCategory(categoryId: number) {
    // Toggle off if the same chip is tapped again so users can clear
    // their selection without leaving the page.
    if (this.category === categoryId) {
      this.category = null;
      this.display_products = null;
      this.filtered_products = null;
      this.product = null;
      this.productSearch = '';
      this.check_in_count = 0;
      this.detectorRef.detectChanges();
      return;
    }
    this.category = categoryId;
    this.check_in_count = 0;
    this.refreshProducts();
  }

  filterProductList() {
    if (!this.productSearch || !this.productSearch.trim()) {
      this.filtered_products = this.display_products;
    } else {
      const q = this.productSearch.toLowerCase();
      this.filtered_products = this.display_products.filter(p => p.name.toLowerCase().includes(q));
    }
  }

  selectProduct(productId: any) {
    if (this.product !== productId) {
      this.check_in_count = 0;
    }
    this.product = productId;
    this.detectorRef.detectChanges();
  }

  syncAllPending = async () => {
    await this.storage.forEach((value, key, index) => {
      if (key.startsWith("pending-door-check-")) {
        this.syncScan(key.split('pending-door-check-')[1]).then((resp) => {console.log(resp)});
      }
    });
    setTimeout(this.syncAllPending, 60000);
  }

  async syncScan(accessCode: string) {
    const pending = await this.storage.get('pending-door-check-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-door-check-' + accessCode).then((value) => {
      return value
    });

    if (pending === null) {
      console.log('Unable to sync missing ' + accessCode);
    }

    const scanData = pending.scanData;
    const _accessCode = scanData.scannedCode.split(":")[0];
    const _validator = scanData.scannedCode.split(":")[1];

    var payload = {attendee_access_code: _accessCode, badge_validator: _validator, scanned_at: pending.scannedAt}
    for (const [key, value] of scanData.productQuantities) {
      payload["product-redeem-" + key] = key
      payload["product-" + key + "-quantity"] = value
    }


    await this.pycon.redeemProducts(payload).then((data) => {
      data.subscribe(
        redemptionData => {
          this.storage.set('synced-door-check-' + accessCode, {...redemptionData, ...pending}).then((value) => {
            this.storage.remove('pending-door-check-' + accessCode);
          });
        },
        err => {
          console.warn('door-check sync failed, will retry on next cycle', accessCode, err);
        }
      )
    })
  }

  async storeScan(accessCode: string, access: boolean, productQuantities: Map<string, number>, scannedCode: string) {
    if (this.last_scan !== null && this.last_scan.code == accessCode) {
      return
    }
    const pending = await this.storage.get('pending-door-check-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-door-check-' + accessCode).then((value) => {
      return value
    });
    if (pending != null) {
      this.syncScan(accessCode);
      return;
    } else {
      const scanDate = new Date();
      return this.storage.set(
        'pending-door-check-' + accessCode,
        {scanData: {productQuantities: productQuantities, scannedCode: scannedCode}, scannedAt: scanDate.toISOString()}
      ).then(() => {
        console.log('Scanned ' + accessCode);
        this.syncScan(accessCode);
      }).catch((error) => {
        console.log('SCAN FAILED ' + accessCode);
      });
    }
  }

  async displayLastScan(accessCode: string, access: boolean, quantity: number, productQuantities: Map<string, number>, scannedCode: string) {
    // A `synced-door-check-<code>` storage key is left behind by a previously
    // completed scan + sync on this device, so its presence means this is at
    // least the second time we're seeing this badge. Show the orange
    // "Already checked in" state instead of green "Checked in" — useful for
    // staff to catch buddy-pass / re-entry attempts.
    const alreadySynced = !!(await this.storage.get('synced-door-check-' + accessCode));
    if (access && quantity > 0) {
      this.storeScan(accessCode, access, productQuantities, scannedCode);
    }
    if (access && quantity > 0 && !alreadySynced) {
      this.check_in_count += 1;
    }
    this.last_scan = {
      "status": access ? quantity : quantity,
      "code": accessCode,
      "already": access && alreadySynced,
      "count": this.check_in_count,
    };
    this.detectorRef.detectChanges();
    this.last_scan_timeout = setTimeout(this.clearLastScan, 5000);
  }

  updateLastScan = async (scannedCode: string) => {
    let access: boolean = false;
    let quantity: number = 0;
    let productQuantities: Map<string, number>  = new Map();

    let accessCode = scannedCode.split(':')[0];

    this.scanningProducts.forEach((productId) => {
      if (this.inventory.get(accessCode)?.get(productId) > 0) {
        access = true;
        quantity += this.inventory.get(accessCode).get(productId);
        productQuantities.set(productId, this.inventory.get(accessCode).get(productId));
      }
    })

    if (access) {
      this.displayLastScan(accessCode, access, quantity, productQuantities, scannedCode);
    } else {
      await this.pycon.fetchAttendeeProductsForProducts(accessCode, this.scanningProducts, "door_check_mode").then((data) => {
        data.subscribe(
          attendeeData => {
            var attendeeDataAny = attendeeData as any;
            if (attendeeDataAny?.has_items_to_redeem) {
              access = true;
              for (var category in attendeeDataAny.redeemable_products_by_category) {
                attendeeDataAny.redeemable_products_by_category[category].forEach((product) => {
                  quantity += product.redeemable;
                  productQuantities.set(product.product_id, product.redeemable);
                })
              }
            }
            this.displayLastScan(accessCode, access, quantity, productQuantities, scannedCode);
          },
          error => {
            this.displayLastScan(accessCode, access, quantity, productQuantities, scannedCode);
          }
        )
      });
    }
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

  addListeners = async () => {
    console.log('restarting scanner');
    const listener = await BarcodeScanner.addListener(
      'barcodesScanned',
      async result => {
        this.handleScan(result)
      },
    );
  }

  removeListeners = async () => {
    console.log('pausing scanner');
    await BarcodeScanner.removeAllListeners();
  }

  clearLastScan = async () => {
    this.last_scan = null;
    this.detectorRef.detectChanges();
  }

  handleScan = async (result: any) => {
    console.log('scanned!');
    await this.removeListeners();
    if (result.barcodes && !this.ignore_scans) {
      clearTimeout(this.last_scan_timeout);
      this.updateLastScan(result.barcodes[0].rawValue);
      setTimeout(this.addListeners, 250);
    }
  }

  startScan = async () => {
    if (this.product === "all") {
        this.scanningProducts = this.display_products.map((product) => {return product.id});
    } else {
        this.scanningProducts = [this.product];
    }

    this.product_attendees = new Map();
    this.inventory = new Map();

    this.scanningProducts.forEach((productId) => {
      this.pycon.fetchAttendeesByProductWithQuantity(productId).then((data) => {
        data.subscribe(attendees => {
          attendees.forEach((attendee) => {
            if (this.product_attendees.has(attendee.id)) {
              this.product_attendees.set(attendee.id, this.product_attendees.get(attendee.id) + attendee.quantity);
            } else {
              this.product_attendees.set(attendee.id, attendee.quantity);
            }

            if (this.inventory.has(attendee.id)) {
              if (this.inventory.get(attendee.id).has(productId)) {
                this.inventory.get(attendee.id).set(productId, this.inventory.get(attendee.id).get(productId) + attendee.quantity);
              } else {
                this.inventory.get(attendee.id).set(productId, attendee.quantity);
              }
            } else {
              this.inventory.set(attendee.id, new Map());
              this.inventory.get(attendee.id).set(productId, attendee.quantity);
            }
          });
        })
      })
    })

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


  };

  stopScan = async () => {
    this.last_scan = null;
    clearTimeout(this.scan_timeout);
    await BarcodeScanner.removeAllListeners();
    await BarcodeScanner.stopScan()
    this.scanning = false;
  }

  ionViewWillLeave() {
    this.stopScan();
  }

  ngOnInit(): void {
    this.ios = this.config.get('mode') === `ios`;
    this.syncAllPending();
    this.pycon.fetchCheckInProducts().then((data) => {
      data.subscribe(redeemable => {
        // /check_in/redeemable/ returns the union of every redeemable
        // category (sessions + swag) and CategorySerializer omits
        // render_type, so we have to discriminate by name. Door check
        // is for sessions/events only — drop the merch categories and
        // any products hanging off them. Long-term fix: expose
        // render_type (==10 for presentations) on the API.
        const categories = (redeemable?.redeemable_categories ?? [])
          .filter(c => !/shirt|swag/i.test(c?.name ?? ''));
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
