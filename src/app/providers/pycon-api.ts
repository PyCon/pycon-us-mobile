import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Storage } from '@ionic/storage-angular';
import { createHash } from 'sha1-uint8array';
import { of } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { Network } from '@capacitor/network';

import { UserData } from './user-data';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PyConAPI {
  base = environment.baseUrl;

  constructor(
    private http: HttpClient,
    private storage: Storage
  ) {
    this.storage.create();
  }

  async buildRequestAuthHeaders(method, url, body): Promise<any> {
    const apiKey = await this.storage.get('key').then((value) => {return value});
    const secret = await this.storage.get('secret').then((value) => {return value});

    const timestamp = Math.round(Date.now() / 1000)
    const baseString = [
      secret,
      timestamp,
      method,
      url,
      body,
    ].join("")

    const headers = {
      'X-API-Key': apiKey,
      'X-API-Signature': createHash().update(baseString).digest("hex"),
      'X-API-Timestamp': String(timestamp),
    }

    return headers;
  }

  async fetchFeatures(): Promise<any> {
    const method = "GET";
    const url = '/2026/api/v1/user/check_features/';
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    console.log(url);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error)
        throw error;
      })
    );
  }

  async fetchPreferences(): Promise<any> {
    const method = "GET";
    const url = '/2026/api/v1/user/mobile_state/';
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error)
        throw error;
      })
    );
  }

  async patchUserData(payload: any): Promise<any> {
    const method = "PATCH";
    const url = '/2026/api/v1/user/mobile_state/';
    const body = JSON.stringify(payload);
    const headers = {"Content-Type": "application/json"}

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    this.http.patch(
      this.base + url,
      body,
      {headers: {...headers, ...authHeaders}}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to persist mobile state, ' + error)
        throw error;
      })
    ).subscribe({
      next: data => {
      },
      error: error => {
      }
    });
  }

  async fetchCheckInProducts(): Promise<any> {
    const method = "GET"
    const url = '/2026/api/v1/check_in/redeemable/';
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error)
        throw error;
      })
    );
  }

  async fetchAttendeesByProduct(productId: number): Promise<any> {
    const method = "GET"
    const url = '/2026/api/v1/check_in/attendees_by_product/' + productId + '/';
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error)
        throw error;
      })
    );
  }

  async fetchAttendeesByProductWithQuantity(productId: number): Promise<any> {
    const method = "GET"
    const url = '/2026/api/v1/check_in/attendees_by_product_with_quantity/' + productId + '/';
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(20000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error)
        throw error;
      })
    );
  }

  async fetchAttendeeProducts(accessCode: string, categoryIdList: Array<number>, mode: string) {
    const method = "GET"
    const url = '/2026/api/v1/check_in/fetch_products/?attendee_access_code=' + accessCode + '&category_pk_list=' + categoryIdList.join(',') + '&mode=' + mode;
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(10000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error)
        throw error;
      })
    );
  }

  async fetchAttendeeProductsForProducts(accessCode: string, productIdList: Array<number>, mode: string) {
    const method = "GET"
    const url = '/2026/api/v1/check_in/fetch_products/?attendee_access_code=' + accessCode + '&product_pk_list=' + productIdList.join(',') + '&mode=' + mode;
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(10000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error);
      throw error;
      })
    );
  }

  async redeemProducts(payload) {
    const method = "POST"
    const url = '/2026/api/v1/check_in/redeem_products/'
    const body = JSON.stringify(payload);
    const headers = {"Content-Type": "application/json"}

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.post(
      this.base + url,
      body,
      {headers: {...headers, ...authHeaders}}
    ).pipe(timeout(10000), catchError(error => {
      console.log('Unable to fetch mobile state, ' + error)
        throw error;
      })
    );
  }

  async fetchCocAttendees(): Promise<any> {
    const method = 'GET';
    const url = '/2026/api/v1/mask_violations/attendees/';
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);

    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(15000), catchError(error => {
      console.log('Unable to fetch CoC attendees, ' + error)
        throw error;
      })
    );
  }

  async captureMaskViolation(accessCode: string, options?: {notes?: string; force?: boolean}): Promise<any> {
    // The name-search-with-notes flow goes through POST so the free-text
    // notes never end up in URL access logs / browser history; the raw
    // badge-scan flow (no notes, no force) keeps the simpler GET shape.
    const useBody = !!(options?.notes || options?.force);
    const url = '/2026/api/v1/mask_violations/capture/'
      + (useBody ? '' : '?attendee_access_code=' + encodeURIComponent(accessCode));

    if (useBody) {
      const payload: any = {attendee_access_code: accessCode};
      if (options?.notes) payload.notes = options.notes;
      if (options?.force) payload.force = true;
      const body = JSON.stringify(payload);
      const authHeaders = await this.buildRequestAuthHeaders('POST', url, body);
      return this.http.post(
        this.base + url,
        body,
        {headers: {...authHeaders, 'Content-Type': 'application/json'}},
      ).pipe(timeout(5000), catchError(error => {
        console.log('Unable to capture violation, ' + error)
          throw error;
        })
      );
    }

    const authHeaders = await this.buildRequestAuthHeaders('GET', url, '');
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(5000), catchError(error => {
      console.log('Unable to capture violation, ' + error)
        throw error;
      })
    )
  }

  async fetchLeadRetrievalSponsors(): Promise<any> {
    const method = 'GET';
    const url = '/2026/api/v1/lead_retrieval/sponsors/';
    const body = '';
    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);
    return this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(5000)).toPromise();
  }

  async setStaffSponsorId(sponsorId: string) {
    await this.storage.set('staff-sponsor-id', sponsorId);
  }

  async clearStaffSponsorId() {
    await this.storage.remove('staff-sponsor-id');
  }

  async syncScan(accessCode: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });

    if (pending === null) {
      console.log('Unable to sync missing ' + accessCode);
    }

    const status = await Network.getStatus();
    console.log(status);
    if (!status.connected) {
      console.log('Skipping until network resumes');
      return;
    }

    const scanData = pending.scanData.split(":");
    const _accessCode = scanData[0];
    const _validator = scanData[scanData.length - 1];

    const method = 'GET';
    const sponsorId = await this.storage.get('staff-sponsor-id');
    let url = '/2026/api/v1/lead_retrieval/capture/?' + 'attendee_access_code=' + encodeURIComponent(accessCode) + "&badge_validator=" + encodeURIComponent(_validator);
    if (sponsorId) {
      url += '&sponsor_id=' + encodeURIComponent(sponsorId);
    }
    const body = '';

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);

    this.http.get(
      this.base + url,
      {headers: authHeaders}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to capture lead, ' + error)
        if (pending.tries == null ) {
            pending.tries = 1;
        } else {
            pending.tries = pending.tries + 1;
        }
        if (pending.tries > 10) {
            this.storage.set('failed-scan-' + accessCode, {...pending}).then((value) => {
                this.storage.remove('pending-scan-' + accessCode).then((value) => {});
            });
        } else {
            this.storage.set('pending-scan-' + accessCode, {...pending});
        }
        throw error;
      })
    ).subscribe({
      next: data => {
        console.log(data['data']);
        this.storage.set('synced-scan-' + accessCode, {...data, ...pending}).then((value) => {
          this.storage.remove('pending-scan-' + accessCode).then((value) => {});
        });
      },
      error: error => {
      }
    });
  }

  async syncNote(accessCode: string): Promise<any> {
    const pending = await this.storage.get('pending-note-' + accessCode).then((value) => {
      return value
    });

    if (pending === null) {
      console.log('Unable to sync note for missing ' + accessCode);
    }

    const sponsorId = await this.storage.get('staff-sponsor-id');
    const noteData = sponsorId ? {...pending, sponsor_id: sponsorId} : pending;
    const method = 'POST';
    const url = '/2026/api/v1/lead_retrieval/' + accessCode + "/note/";
    const body = JSON.stringify(noteData);
    const headers = {"Content-Type": "application/json"}

    const authHeaders = await this.buildRequestAuthHeaders(method, url, body);

    this.http.post(
      this.base + url,
      body,
      {headers: {...headers, ...authHeaders}}
    ).pipe(timeout(2000), catchError(error => {
      console.log('Unable to capture lead, ' + error)
        throw error;
      })
    ).subscribe({
      next: data => {
        console.log(data);
        this.storage.remove('pending-note-' + accessCode).then((value) => {});
      },
      error: error => {
      }
    });
  }

  async getNote(accessCode): Promise<any> {
    return this.storage.get('note-' + accessCode).then((value) => {
      return value;
    })
  }

  async storeNote(accessCode: string, note: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });
    console.log(pending, synced, note);
    this.storage.set('note-' + accessCode, {accessCode: accessCode, note: note})
    this.storage.set('pending-note-' + accessCode, {accessCode: accessCode, note: note}).then((value) => {
      this.syncNote(accessCode);
    })
    if (synced != null) {
      this.storage.set('synced-scan-' + accessCode, {...synced, ...{note: true}})
    }
    if (pending != null) {
      this.storage.set('pending-scan-' + accessCode, {...pending, ...{note: true}})
    }
  }

  async fetchScan(accessCode: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });
    if (synced != null) { return synced };
    if (pending != null) { return pending };
  }

  async storeScan(accessCode: string, scanData: string): Promise<any> {
    const pending = await this.storage.get('pending-scan-' + accessCode).then((value) => {
      return value
    });
    const synced = await this.storage.get('synced-scan-' + accessCode).then((value) => {
      return value
    });
    if (synced != null) {
      console.log('Already captured ' + accessCode)
      return;
    } else if (pending != null) {
      this.syncScan(accessCode);
      return;
    } else {
      const scanDate = new Date();
      const sponsorId = await this.storage.get('staff-sponsor-id');
      const sponsorName = await this.storage.get('staff-sponsor-name');
      return this.storage.set(
        'pending-scan-' + accessCode,
        {scanData: scanData, scannedAt: scanDate.toISOString(), sponsorId: sponsorId, sponsorName: sponsorName}
      ).then(() => {
        console.log('Scanned ' + accessCode);
        this.syncScan(accessCode);
      }).catch((error) => {
        console.log('SCAN FAILED ' + accessCode);
      });
    }
  }
}
