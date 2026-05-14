import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { IonSearchbar, LoadingController } from '@ionic/angular';

import { ConferenceData } from '../providers/conference-data';

export interface BoothData {
  id: string;
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
  imgW: number;
  imgH: number;
  logoUrl?: string;
  level?: string;
  description?: string;
}

@Component({
  selector: 'app-expo-hall-map',
  templateUrl: './expo-hall-map.component.html',
  styleUrls: ['./expo-hall-map.component.scss'],
})
export class ExpoHallMapComponent implements OnInit, AfterViewInit {
  @ViewChild('searchBar') searchBar!: IonSearchbar;
  @ViewChild('pinchZoom', { read: ElementRef }) pinchZoomEl?: ElementRef<HTMLElement>;
  @ViewChild('pinchZoom') pinchZoomCmp?: {
    pinchZoom?: {
      maxScale: number;
      scale: number;
      moveX: number;
      moveY: number;
      element: HTMLElement;
      properties: { transitionDuration: number };
      setZoom: (p: { scale: number; center?: number[] }) => void;
      transformElement: (duration: number) => void;
      updateInitialValues: () => void;
    };
  };

  showSearchbar = false;
  searchQuery = '';
  searchResults: BoothData[] = [];
  selectedBooth: BoothData | null = null;
  highlightedBoothId: string | null = null;

  // Static logo fallbacks for booths that don't come through the sponsor API
  // (PSF, community booths, attendee lounge, etc.). Keyed by booth id.
  private readonly STATIC_BOOTH_LOGOS: { [id: string]: string } = {
    '407': 'assets/img/python-logo.png',
    '606': 'assets/img/pycon-us-2026-logo.svg',
  };

  // Booth coordinates in the original 9931×7021 floor plan image.
  // Names are the seed labels — they get overwritten with the live sponsor
  // name (and gain logoUrl/level/description) once the API responds.
  booths: BoothData[] = [
    { id: '245', name: 'Lerner Python Training',                                     top:  809, left: 3906, width: 480,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '344', name: 'Zyte',                                                       top:  809, left: 4393, width: 390,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '243', name: 'Analog Devices',                                             top: 1145, left: 3906, width: 480,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '342', name: 'marimo',                                                     top: 1144, left: 4392, width: 390,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '539', name: 'Posit, PBC',                                                 top: 1203, left: 6867, width: 458,  height: 651,  imgW: 9931, imgH: 7021 },
    { id: '638', name: 'AlphaSense',                                                 top: 1201, left: 7330, width: 415,  height: 660,  imgW: 9931, imgH: 7021 },
    { id: '639', name: 'Snowflake',                                                  top: 1168, left: 7858, width: 460,  height: 700,  imgW: 9931, imgH: 7021 },
    { id: '140', name: 'Chonkie',                                                    top: 1470, left: 2372, width: 428,  height: 332,  imgW: 9931, imgH: 7021 },
    { id: '141', name: 'Tetrix',                                                     top: 1466, left: 2932, width: 380,  height: 335,  imgW: 9931, imgH: 7021 },
    { id: '240', name: 'Old Mission',                                                top: 1468, left: 3318, width: 475,  height: 335,  imgW: 9931, imgH: 7021 },
    { id: '138', name: 'Sublimage',                                                  top: 1807, left: 2371, width: 429,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '238', name: 'Jinja.App',                                                  top: 1810, left: 3319, width: 475,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '136', name: 'Capisclo',                                                   top: 2144, left: 2370, width: 430,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '137', name: 'Arcjet',                                                     top: 2143, left: 2922, width: 391,  height: 325,  imgW: 9931, imgH: 7021 },
    { id: '236', name: 'Minimus',                                                    top: 2146, left: 3319, width: 477,  height: 322,  imgW: 9931, imgH: 7021 },
    { id: '237', name: 'Tower Research Capital',                                     top: 2144, left: 3893, width: 502,  height: 335,  imgW: 9931, imgH: 7021 },
    { id: '134', name: 'PixelTable',                                                 top: 2479, left: 2372, width: 427,  height: 332,  imgW: 9931, imgH: 7021 },
    { id: '135', name: 'TimeCopilot',                                                top: 2474, left: 2922, width: 390,  height: 344,  imgW: 9931, imgH: 7021 },
    { id: '234', name: 'Python Institute',                                           top: 2474, left: 3318, width: 440,  height: 345,  imgW: 9931, imgH: 7021 },
    { id: '235', name: 'Elastic',                                                    top: 2483, left: 3977, width: 410,  height: 316,  imgW: 9931, imgH: 7021 },
    { id: '334', name: 'Apify',                                                      top: 2475, left: 4392, width: 400,  height: 340,  imgW: 9931, imgH: 7021 },
    { id: '335', name: 'Pydantic',                                                   top: 2157, left: 4938, width: 442,  height: 650,  imgW: 9931, imgH: 7021 },
    { id: '434', name: 'Red Hat',                                                    top: 2155, left: 5386, width: 420,  height: 650,  imgW: 9931, imgH: 7021 },
    { id: '126', name: 'Cloudflare',                                                 top: 2877, left: 2356, width: 460,  height: 640,  imgW: 9931, imgH: 7021 },
    { id: '127', name: 'Hudson River Trading',                                       top: 2873, left: 2826, width: 486,  height: 648,  imgW: 9931, imgH: 7021 },
    { id: '226', name: 'Kraken Tech',                                                top: 2871, left: 3317, width: 430,  height: 660,  imgW: 9931, imgH: 7021 },
    { id: '122', name: 'Sentry',                                                     top: 3526, left: 2358, width: 465,  height: 645,  imgW: 9931, imgH: 7021 },
    { id: '116', name: 'Cubist Systematic Strategies',                               top: 4230, left: 2278, width: 545,  height: 654,  imgW: 9931, imgH: 7021 },
    { id: '112', name: 'Jane Street',                                                top: 4890, left: 2349, width: 470,  height: 640,  imgW: 9931, imgH: 7021 },
    { id: '119', name: 'AWS',                                                        top: 3955, left: 2980, width: 650,  height: 740,  imgW: 9931, imgH: 7021 },
    { id: '113', name: 'Capital One',                                                top: 4789, left: 2981, width: 650,  height: 740,  imgW: 9931, imgH: 7021 },
    { id: '427', name: 'SerpApi',                                                    top: 2850, left: 6130, width: 730,  height: 765,  imgW: 9931, imgH: 7021 },
    { id: '531', name: 'Chainguard',                                                 top: 2629, left: 6906, width: 425,  height: 665,  imgW: 9931, imgH: 7021 },
    { id: '630', name: 'Hex',                                                        top: 2627, left: 7336, width: 415,  height: 667,  imgW: 9931, imgH: 7021 },
    { id: '421', name: 'JetBrains',                                                  top: 3676, left: 6126, width: 730,  height: 730,  imgW: 9931, imgH: 7021 },
    { id: '621', name: 'Codespeed',                                                  top: 3732, left: 7845, width: 425,  height: 685,  imgW: 9931, imgH: 7021 },
    { id: '720', name: 'QUBE Research & Technologies',                               top: 3726, left: 8275, width: 480,  height: 690,  imgW: 9931, imgH: 7021 },
    { id: '635', name: 'ClickHouse',                                                 top: 1970, left: 7880, width: 400,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '734', name: 'Djangonauts / DSF',                                          top: 1970, left: 8282, width: 440,  height: 328,  imgW: 9931, imgH: 7021 },
    { id: '735', name: 'Python en Español',                                          top: 1976, left: 9132, width: 430,  height: 320,  imgW: 9931, imgH: 7021 },
    { id: '633', name: 'Reflex',                                                     top: 2306, left: 7876, width: 400,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '732', name: 'Black Python Devs',                                          top: 2302, left: 8281, width: 440,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '733', name: 'EuroPython Society',                                         top: 2302, left: 9133, width: 430,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '631', name: 'Auth0',                                                      top: 2641, left: 7861, width: 415,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '730', name: 'CodeDay',                                                    top: 2642, left: 8283, width: 440,  height: 331,  imgW: 9931, imgH: 7021 },
    { id: '731', name: 'PyLadies',                                                   top: 2635, left: 9137, width: 425,  height: 336,  imgW: 9931, imgH: 7021 },
    { id: '629', name: 'Temporal',                                                   top: 2976, left: 7859, width: 420,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '728', name: 'SCaLE / Data Con LA / San Diego Python / Inland Empire PUG', top: 2976, left: 8283, width: 440,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '729', name: 'Python Asia Organization',                                   top: 2976, left: 9133, width: 430,  height: 330,  imgW: 9931, imgH: 7021 },
    { id: '627', name: 'ReversingLabs',                                              top: 3311, left: 7861, width: 417,  height: 368,  imgW: 9931, imgH: 7021 },
    { id: '726', name: 'Pybeach / SoCal Python',                                     top: 3310, left: 8285, width: 523,  height: 370,  imgW: 9931, imgH: 7021 },
    { id: '727', name: 'PyCon Africa / Seneg. / Mozambique',                         top: 3310, left: 9072, width: 490,  height: 400,  imgW: 9931, imgH: 7021 },
    { id: '213', name: 'Microsoft',                                                  top: 4477, left: 4042, width: 660,  height: 1060, imgW: 9931, imgH: 7021 },
    { id: '313', name: 'Anaconda',                                                   top: 4803, left: 4957, width: 680,  height: 730,  imgW: 9931, imgH: 7021 },
    { id: '413', name: 'Meta',                                                       top: 4485, left: 6151, width: 700,  height: 1070, imgW: 9931, imgH: 7021 },
    { id: '513', name: 'Vercel',                                                     top: 4799, left: 6988, width: 700,  height: 753,  imgW: 9931, imgH: 7021 },
    { id: '613', name: 'Bloomberg',                                                  top: 4488, left: 7913, width: 700,  height: 1070, imgW: 9931, imgH: 7021 },
    { id: '407', name: 'PSF',                                                        top: 5727, left: 6172, width: 640,  height: 740,  imgW: 9931, imgH: 7021 },
    { id: '606', name: 'Attendee Lounge',                                            top: 5724, left: 6818, width: 960,  height: 740,  imgW: 9931, imgH: 7021 },
    { id: '709', name: 'CesiumAstro',                                                top: 5788, left: 8883, width: 390,  height: 390,  imgW: 9931, imgH: 7021 },
    { id: '713', name: 'Codeflash',                                                  top: 4857, left: 8840, width: 437,  height: 670,  imgW: 9931, imgH: 7021 },
  ];

  constructor(
    private confData: ConferenceData,
    private loadingCtrl: LoadingController,
  ) {}

  ngOnInit() {
    this.loadSponsors();
  }

  // Zoom factor used when arriving via "?booth=<id>" (e.g. from a sponsor
  // detail page). Tuned to fill ~1/4 of the viewport with the booth and its
  // immediate neighbours so attendees can orient quickly.
  private static readonly DEEPLINK_ZOOM_SCALE = 6;

  // The bottom popup covers ~110px on a 390×844 viewport. Shift the booth's
  // zoom target up by half that so the highlighted booth lands above the
  // popup instead of underneath it.
  private static readonly DEEPLINK_POPUP_OFFSET_PX = 60;

  // Booth id queued before pinch-zoom finishes initializing. ngAfterViewInit
  // polls for the IvyPinch instance, and the parent ConferenceMapPage may
  // call zoomToBoothId() before that polling completes (especially on cold
  // entry to the tab when image + pinch-zoom are still hydrating). We hold
  // the id here and apply it the moment pinch-zoom is ready.
  private pendingBoothId: string | null = null;
  private pinchReady = false;
  // Token incremented per zoom request so async work (image-load wait)
  // belonging to a superseded request can short-circuit instead of
  // clobbering the latest zoom — protects against the rare race where the
  // user taps two booth pills in fast succession before the floor-plan
  // image has finished loading.
  private zoomToken = 0;

  ngAfterViewInit() {
    // @ciag/ngx-pinch-zoom hardcodes defaultMaxScale=3 and only auto-derives
    // a higher cap when the first descendant is an <img> AND limitZoom is
    // the string "original image size". Our content is wrapped in a div so
    // the auto-detect path is never taken; passing a numeric limitZoom is
    // silently ignored. Reach into the underlying IvyPinch instance after
    // it's constructed and bump maxScale directly. Polled because the
    // instance is created during ngOnInit on the child component.
    const start = Date.now();
    const tick = () => {
      const inner = this.pinchZoomCmp?.pinchZoom;
      if (inner) {
        inner.maxScale = 25;
        this.pinchReady = true;
        if (this.pendingBoothId) {
          const id = this.pendingBoothId;
          this.pendingBoothId = null;
          this.zoomToBoothId(id);
        }
        return;
      }
      if (Date.now() - start < 2000) {
        setTimeout(tick, 50);
      }
    };
    tick();
  }

  /**
   * Public entry point used by ConferenceMapPage to request a zoom-to-booth.
   * Driven by Ionic's ionViewWillEnter on the parent page so it fires
   * reliably on first nav, cached re-entry with a different ?booth=, the
   * same ?booth= twice in a row (re-centers if the user has panned away),
   * tab-switch return, and cold-start deeplinks.
   *
   * No `lastZoomedBoothId` guard: if the parent calls us, it's because the
   * user explicitly asked to see this booth — we should always re-center,
   * even if the id matches the previous zoom (the user may have panned).
   */
  zoomToBoothId(boothId: string | null | undefined) {
    if (!boothId) return;
    const id = String(boothId);
    if (!this.pinchReady) {
      this.pendingBoothId = id;
      return;
    }
    const booth = this.booths.find(b => b.id === id);
    if (!booth) return;
    const token = ++this.zoomToken;
    requestAnimationFrame(() => {
      // Bail if a newer request superseded us between the rAF schedule
      // and its callback (extremely unlikely but cheap to guard).
      if (token !== this.zoomToken) return;
      this.zoomToBooth(booth, token);
    });
  }

  private async zoomToBooth(booth: BoothData, token?: number) {
    const inner = this.pinchZoomCmp?.pinchZoom;
    const host = this.pinchZoomEl?.nativeElement;
    if (!inner || !host || !host.offsetWidth) return;

    // The floor plan PNG is large (~10K wide) and may still be loading. If we
    // call setZoom while img.offsetHeight is 0, pinch-zoom's internal
    // limitPanY treats the image as empty and re-centers, clobbering our
    // moveY. Wait for the image to actually have layout dimensions first.
    const imgEl = host.querySelector('img') as HTMLImageElement | null;
    if (imgEl && (!imgEl.complete || imgEl.naturalWidth === 0 || imgEl.offsetHeight === 0)) {
      await new Promise<void>(resolve => {
        const done = () => { imgEl.removeEventListener('load', done); resolve(); };
        imgEl.addEventListener('load', done);
        // Safety net: stop waiting after 5s so we still attempt the zoom.
        setTimeout(done, 5000);
      });
    }

    // If a newer zoomToBoothId() arrived while we were waiting on the image,
    // abandon this stale request so it doesn't clobber the latest target.
    if (token !== undefined && token !== this.zoomToken) return;

    // We bypass IvyPinch.setZoom() because it always runs centeringImage() →
    // limitPanY() afterwards, and that clamp assumes the image fills the
    // host. Our floor plan PNG is wider than tall (W:H ≈ 1.41:1) inside a
    // tall mobile viewport, so it only occupies the top ~275px of a ~655px
    // tall host. limitPanY then refuses to let the booth land anywhere
    // except near the top of the viewport, no matter what we pass for
    // `center`. Setting scale + moveX/moveY on the IvyPinch instance
    // ourselves and calling transformElement directly skips the clamp.
    //
    // Math: a point at inner-element pixel (px, py) ends up displayed at
    // (moveX + S·px, moveY + S·py). To park the booth's center at screen
    // (W/2, H/2 − popupOffset):
    //   moveX = W/2 − S·boothPx
    //   moveY = (H/2 − popupOffset) − S·boothPy
    // The popup offset lifts the booth above the fixed bottom popup card so
    // it isn't hidden behind it.
    // .map-inner is `display: inline-block` so baseline alignment within
    // .pinch-zoom-content offsets it down by some amount we have to find at
    // runtime — otherwise the booth lands hundreds of pixels too low after
    // the scale-by-six. Read mapInner's actual offsetTop within its parent
    // and fold it into the booth's pre-transform Y.
    const mapInner = host.querySelector('.map-inner') as HTMLElement | null;
    const mapInnerTop = mapInner?.offsetTop ?? 0;
    const mapInnerLeft = mapInner?.offsetLeft ?? 0;

    const S = ExpoHallMapComponent.DEEPLINK_ZOOM_SCALE;
    const W = host.offsetWidth;
    const H = host.offsetHeight;
    const popupOffset = ExpoHallMapComponent.DEEPLINK_POPUP_OFFSET_PX;
    const imgDisplayH = W * (booth.imgH / booth.imgW);
    const fracX = (booth.left + booth.width / 2) / booth.imgW;
    const fracY = (booth.top + booth.height / 2) / booth.imgH;
    const boothPx = mapInnerLeft + fracX * W;
    const boothPy = mapInnerTop  + fracY * imgDisplayH;
    const newMoveX = W / 2 - S * boothPx;
    const newMoveY = (H / 2 - popupOffset) - S * boothPy;

    inner.scale = S;
    inner.moveX = newMoveX;
    inner.moveY = newMoveY;
    inner.transformElement(inner.properties?.transitionDuration ?? 200);
    inner.updateInitialValues();

    // Also surface the popup + ring around the booth. Defer past the zoom
    // animation so the booth is already in frame when the popup appears.
    setTimeout(() => {
      this.selectedBooth = booth;
      this.highlightedBoothId = booth.id;
    }, 250);
  }

  loadSponsors(showLoader = false) {
    // Seed static fallbacks first so the API merge can override them when a
    // booth does come through as a sponsor; otherwise PSF/community booths
    // remain blank.
    for (const booth of this.booths) {
      if (!booth.logoUrl && this.STATIC_BOOTH_LOGOS[booth.id]) {
        booth.logoUrl = this.STATIC_BOOTH_LOGOS[booth.id];
      }
    }

    const apply = (sponsors: any) => {
      for (const list of Object.values(sponsors || {})) {
        for (const sponsor of list as any[]) {
          if (sponsor.booth_number == null) continue;
          const booth = this.booths.find(b => b.id === String(sponsor.booth_number));
          if (!booth) continue;
          booth.logoUrl = sponsor.logo_url;
          booth.level = sponsor.level;
          booth.description = sponsor.description;
          if (sponsor.name) booth.name = sponsor.name;
        }
      }
    };

    if (!showLoader) {
      this.confData.getSponsors().subscribe(apply);
      return;
    }
    this.loadingCtrl.create({ message: 'Fetching latest...', duration: 10000 }).then(loader => {
      loader.present();
      this.confData.getSponsors().subscribe((sponsors: any) => {
        apply(sponsors);
        setTimeout(() => loader.dismiss(), 100);
      });
    });
  }

  getBoothStyle(booth: BoothData): { [key: string]: string } {
    return {
      'top':    `calc(${booth.top}    / ${booth.imgH} * 100%)`,
      'left':   `calc(${booth.left}   / ${booth.imgW} * 100%)`,
      'width':  `calc(${booth.width}  / ${booth.imgW} * 100%)`,
      'height': `calc(${booth.height} / ${booth.imgH} * 100%)`,
    };
  }

  toggleSearch() {
    this.showSearchbar = !this.showSearchbar;
    if (!this.showSearchbar) {
      this.clearSearch();
    } else {
      setTimeout(() => this.searchBar?.setFocus(), 150);
    }
  }

  onSearch() {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) { this.searchResults = []; return; }
    this.searchResults = this.booths.filter(b =>
      b.name.toLowerCase().includes(q) || b.id.includes(q)
    );
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchbar = false;
    this.highlightedBoothId = null;
  }

  selectBooth(booth: BoothData) {
    this.searchResults = [];
    this.showSearchbar = false;
    this.searchQuery = '';
    this.highlightedBoothId = booth.id;
    this.selectedBooth = booth;
    setTimeout(() => {
      const el = document.getElementById('boothgroup-' + booth.id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 100);
  }

  onBoothTap(booth: BoothData) {
    this.selectedBooth = booth;
    this.highlightedBoothId = booth.id;
  }

  // Close the popup AND drop the yellow ring around the booth. The X button
  // and the outside-tap dismiss should both fully reset selection so we're
  // not left with a stale highlight after the user moves on.
  closePopup() {
    this.selectedBooth = null;
    this.highlightedBoothId = null;
  }

  // Mirror sponsors page slug logic so the popup can deep-link into the
  // existing sponsor detail page. Booths without a sponsor match (community
  // booths like SoCal Python) won't have a level set; the template hides the
  // link in that case.
  getSponsorSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
}
