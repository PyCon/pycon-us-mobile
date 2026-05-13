import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { of, Observable } from 'rxjs';
import { map, timeout, catchError } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';
import { ToastController } from '@ionic/angular';
import markdownToTxt from 'markdown-to-txt';

import { UserData } from './user-data';
import { environment } from '../../environments/environment';
import { ROOM_LOCATIONS } from '../location-map/room-locations';

@Injectable({
  providedIn: 'root'
})
export class ConferenceData {
  data: any;
  slotColors: any = {
    plenary: 'primary',
    poster: 'tertiary',
    event: 'light',
    summit: 'light',
    break: 'light',
    informational: 'medium',
    openSpace: 'light',
  };

  trackIcons: Record<string, string> = {
    'Break': 'cafe-outline',
    'Lightning-talks': 'flash-outline',
    'Tutorial': 'book-outline',
    'Plenary': 'megaphone-outline',
    'Keynote': 'star-outline',
    'Sponsor Presentation': 'briefcase-outline',
    'Poster': 'easel-outline',
    'Talk': 'mic-outline',
    'Security': 'shield-checkmark-outline',
    'Charla': 'chatbubbles-outline',
    'Ai': 'hardware-chip-outline',
    'Open Space': 'people-circle-outline',
  };

  getTrackIcon(trackName: string): string {
    return this.trackIcons[trackName] || 'mic-outline';
  }

  private resolveSpeakerPhoto(photo?: string | null): string {
    if (!photo) return 'assets/img/person-circle-outline.png';
    return /^https?:\/\//.test(photo) ? photo : `${environment.baseUrl}${photo}`;
  }

  private resolveOpenSpaceImage(image?: string | null): string | null {
    // Mirror resolveSpeakerPhoto: backend returns site-relative paths
    // (/2026/media/open_spaces_images/foo.png) which break under livereload
    // because the document origin is the dev server, not the API host.
    if (!image) return null;
    return /^https?:\/\//.test(image) ? image : `${environment.baseUrl}${image}`;
  }

  slugifyRoom(name: string): string {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // Pretalx leaves cancelled-talk slots in the feed with name === kind,
  // no description, and no speakers. The web schedule hides them; without
  // this filter the mobile app shows a row literally titled "talk".
  //
  // CAREFUL: posters and breaks legitimately have this same shape
  // (name="poster"/"break", empty description, no contact) — but they're
  // *not* cancelled, they're collapsed/expanded later. Skip those kinds
  // here so we don't accidentally drop them. Filtering out poster slots
  // here was the cause of posters leaking onto every track page (their
  // "Poster" track never got registered). PYMOBIL-117 / PYMOBIL-bug.
  private isPlaceholderSlot(slot: any): boolean {
    if (!slot || typeof slot.kind !== 'string') return false;
    if (slot.kind === 'poster' || slot.kind === 'break') return false;
    const name = typeof slot.name === 'string' ? slot.name.trim().toLowerCase() : '';
    if (!name) return false;
    if (name !== slot.kind.toLowerCase()) return false;
    const hasDescription = typeof slot.description === 'string' && slot.description.trim() !== '';
    if (hasDescription) return false;
    const speakers = Array.isArray(slot.contact) ? slot.contact : [];
    const authors = Array.isArray(slot.authors) ? slot.authors : [];
    return speakers.length === 0 && authors.length === 0;
  }

  constructor(
    public http: HttpClient,
    public user: UserData,
    public storage: Storage,
    private toastController: ToastController,
  ) {
    this.storage.create();
  }

  async presentMessage(message) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      position: 'top',
      icon: 'exclamation'
    });
    toast.present();
  }

  invalidateCache() {
    this.data = null;
    this.storage.remove('schedule-cache');
  }

  load(): any {
    if (this.data) {
      return of(this.data);
    } else {
      return new Observable(observer => {
        // Try cache first for instant render
        this.storage.get('schedule-cache').then((cached) => {
          if (cached) {
            this.processData(cached);
            observer.next(this.data);
          }

          // Then fetch from network
          this.http
            .get(`${environment.baseUrl}/2026/schedule/conference.json`)
            .pipe(timeout(10000))
            .subscribe({
              next: (freshData) => {
                this.data = null; // reset to reprocess
                this.processData(freshData);
                observer.next(this.data);
                observer.complete();
              },
              error: (error) => {
                console.log('Unable to load latest from remote, ' + error);
                if (this.data) {
                  // Already served cache, just complete
                  observer.complete();
                } else {
                  this.presentMessage('Unable to load schedule, no offline cache available');
                  observer.error(error);
                }
              }
            });
        }).catch(() => {
          // No cache, go straight to network
          this.http
            .get(`${environment.baseUrl}/2026/schedule/conference.json`)
            .pipe(timeout(10000))
            .subscribe({
              next: (freshData) => {
                this.processData(freshData);
                observer.next(this.data);
                observer.complete();
              },
              error: (error) => {
                this.presentMessage('Unable to load schedule, no offline cache available');
                observer.error(error);
              }
            });
        });
      });
    }
  }

  processData(data: any) {
    this.storage.set('schedule-cache', data);

    // just some good 'ol JS fun with objects and arrays
    // build up the data by linking speakers to sessions
    this.data = {
      "schedule": [],
      "speakers": [],
      "tracks": ["open-spaces"],
      "sessions": [],
      "conference": data.conference,
      "open-spaces": [],
      "sprints": data.sprints || [],
      "job-listings": data['job-listings'] || [],
      "posters": (data.posters || []).map((poster: any) => ({
        ...poster,
        speakers: (poster.speakers || []).map((s: any) => ({
          ...s,
          photo: this.resolveSpeakerPhoto(s.photo),
        })),
      })),
    };

    // Register poster speakers in the global speakers list so tapping a poster
    // author navigates to a populated speaker detail page (the speaker-detail
    // route looks up by id from data.speakers).
    this.data.posters.forEach((poster: any) => {
      poster.speakers.forEach((speaker: any) => {
        if (!this.data.speakers.find((s: any) => s.id === speaker.id)) {
          this.data.speakers.push({
            id: speaker.id,
            name: speaker.name,
            profilePic: speaker.photo,
            about: speaker.bio || '',
          });
        }
      });
    });

    // Register the Open Space track up front so it appears in the schedule
    // filter even when the user has it hidden by default — they need a way
    // to re-enable it.
    if (data['open-spaces'].length && !this.data.tracks.find((t: any) => t && t.name === 'Open Space')) {
      this.data.tracks.push({ name: 'Open Space', icon: this.getTrackIcon('Open Space') });
    }

    data['open-spaces'].forEach((openSpace: any) => {
      // Skip submissions that haven't been scheduled yet — un-roomed or
      // un-timed entries are *proposals*, not confirmed sessions, and
      // shouldn't appear on the schedule. The pretalx feed includes all
      // submissions regardless of state.
      if (!openSpace?.start || !openSpace?.end) return;
      const startMs = new Date(openSpace.start).getTime();
      const endMs = new Date(openSpace.end).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) return;
      const room = openSpace.room_display || openSpace.room || '';
      if (!room.trim()) return;
      var start = new Date(openSpace.start);
      var end = new Date(openSpace.end);
      var session = {
        "name": openSpace.title,
        "color": 'light',
        "preRegistered": false,
        // Tap goes to the session detail page (which has open-space-aware
        // rendering already). Setting listRender:true would route taps to
        // the Open Spaces list instead — fine when this entry only existed
        // there, but now that it's inline on the schedule we want detail.
        "listRender": false,
        "section": "open-spaces",
        "location": openSpace.room_display,
        "description": openSpace.description,
        "speakers": [],
        "speakerNames": [],
        "timeStart": start.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
        "timeEnd": end.toLocaleString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
        "startUtc": openSpace.start,
        "endUtc": openSpace.end,
        "track": "Open Space",
        // Use the display name everywhere so excludeTracks (driven by the
        // filter modal which surfaces display names) actually matches.
        "tracks": ["Open Space"],
        "id": openSpace.conf_key + 9000,
        "day": start.toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'}),
        "imageUrl": this.resolveOpenSpaceImage(openSpace.image_url),
        // Deep-link to the open-space modal on us.pycon.org. The website
        // opens a <dialog> matching `#OpenSpace-<id>` on hash change
        // (see pycon-site/static/js/lib/dialog.js, PR #712). conf_key is
        // the OpenSpacesSignup PK on the website side. The page lives at
        // /2026/schedule/open-spaces/, NOT /2026/schedule/conference/.
        "siteUrl": `${environment.baseUrl}/2026/schedule/open-spaces/#OpenSpace-${openSpace.conf_key}`,
      }
      this.data.sessions.push(session);

      // Also slot the open-space into the schedule day/time group so it
      // appears inline on the day timeline alongside talks/tutorials,
      // not just on the dedicated Open Spaces page.
      const offset = environment.utcOffset;
      const estDate = new Date(start.getTime() + (offset * 3600 * 1000));
      const day = estDate.toISOString().split('T')[0];
      const group = start.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute: '2-digit'}).toLowerCase();
      const scheduleDay = this.data.schedule.find((d: any) => d.date === day);
      if (scheduleDay) {
        const scheduleDayGroup = scheduleDay.groups.find((g: any) => g.time === group);
        if (scheduleDayGroup) {
          scheduleDayGroup.sessions.push(session);
        } else {
          scheduleDay.groups.push({"time": group, "sessions": [session], "startTime": start});
        }
      } else {
        this.data.schedule.push({"date": day, "groups": [{"time": group, "sessions": [session], "startTime": start}]});
      }
    });

    // Drop plenary slots that are mislabeled posters. The conference.json
    // upstream sometimes returns the daily posters block as kind="plenary" with
    // a name like "Posters (Hall AB)" — see PYMOBIL-108. The actual poster
    // slots come through correctly as kind="poster" and are collapsed below,
    // so this entry is always a duplicate.
    //
    // Also drop placeholder open-space rows (kind="available-open-space" or
    // "available-open-space-slot") — backend emits these for every unbooked
    // open-space room/timeslot. They have no title, no track, null location,
    // and shouldn't appear on the schedule.
    //
    // And drop empty/cancelled session stubs — when a talk is cancelled the
    // pretalx feed leaves the timeslot in place with name === kind ("talk",
    // "charla", …), no description, no speakers. The web schedule hides
    // these; we should too. See PYMOBIL-117.
    data.schedule = data.schedule.filter((slot: any) => {
      if (typeof slot.kind === 'string' && slot.kind.startsWith('available-open-space')) {
        return false;
      }
      if (this.isPlaceholderSlot(slot)) return false;
      if (slot.kind !== 'plenary') return true;
      const cleanName = markdownToTxt(slot.name).replace(/\s*\([^)]*\)\s*$/, '').trim();
      return !/^posters?$/i.test(cleanName);
    });

    // Collapse repeating slots (posters, breaks) into single entries per day/time
    const collapseKinds = ['poster', 'break'];
    const collapsedGroups = new Map<string, any>();
    data.schedule.filter((s: any) => collapseKinds.includes(s.kind)).forEach((slot: any) => {
      const day = new Date(slot.start).toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'});
      const slotName = markdownToTxt(slot.name);
      // Include start time in the key for break slots so morning and
      // afternoon "Break" entries don't collapse into a single 10:30-4:30
      // row spanning lunches and afternoon talks. Per-room same-start
      // breaks/lunches still merge correctly because they share start.
      //
      // EXCEPTION: lunch is staggered across rooms (e.g. talks ending at
      // 12:30 in some rooms and 12:45 in others) and the API ships each
      // staggered start as a separate "Lunch (Hall AB)" break slot. Users
      // expect ONE Lunch row per day spanning the earliest to latest
      // window, not 12:30/12:45/1:00/1:15 duplicates. Drop start from
      // the key for lunch-named slots so they all collapse together; the
      // merge code below already takes earliest-start + latest-end.
      //
      // POSTERS are different — every individual poster slot in the API
      // is a 5-minute kind="poster" entry with name="Posters", and we
      // intentionally fold the entire daily poster session into ONE row.
      // Adding start to the key here would split them back into 50+
      // 5-minute rows, which is the regression PR #289 introduced.
      // So: only add start for breaks that aren't lunch.
      const isLunch = /^lunch\b/i.test(slotName);
      const startKey = slot.kind === 'break' && !isLunch ? `-${slot.start}` : '';
      const key = `${slot.kind}-${day}-${slotName}${startKey}`;
      if (!collapsedGroups.has(key)) {
        // Rename lunchtime breaks
        let name = slot.kind === 'poster' ? 'Posters' : markdownToTxt(slot.name);
        if (slot.kind === 'break' && (name === 'Break' || name === 'break')) {
          const slotHour = parseInt(new Date(slot.start).toLocaleTimeString([], {timeZone: environment.timezone, hour12: false, hour: 'numeric'}));
          if (['Fri', 'Sat', 'Sun'].includes(day) && slotHour >= 12 && slotHour < 14) {
            name = 'Lunch';
          }
        }
        // Extract room from parentheses in name (e.g., "Lunch (Hall AB)" → room="Hall AB")
        // and normalize bare "Hall AB"/"Hall C" to the canonical "Expo Hall …"
        // venue used by posters, so a breakfast/lunch in the expo hall lines up
        // with the same room bucket. Generic comma-joined breaks ("Break" with
        // multiple rooms) are left untouched so the room-derivation pass below
        // can fan them out across every listed room.
        let room = slot.room;
        const roomMatch = name.match(/\s*\(([^)]+)\)\s*$/);
        if (roomMatch) {
          room = roomMatch[1];
          name = name.replace(roomMatch[0], '').trim();
        }
        if (room && /^Hall\s/i.test(room)) {
          room = `Expo ${room}`;
        }
        collapsedGroups.set(key, { ...slot, name, room, endSlot: slot });
      } else {
        const group = collapsedGroups.get(key);
        if (new Date(slot.end) > new Date(group.endSlot.end)) {
          group.endSlot = slot;
          group.end = slot.end;
        }
        if (new Date(slot.start) < new Date(group.start)) {
          group.start = slot.start;
        }
        // If current group has no/empty room but this slot has a parenthesized one, use it
        if (!group.room || group.room === '') {
          const laterRoom = markdownToTxt(slot.name).match(/\s*\(([^)]+)\)\s*$/);
          if (laterRoom) {
            group.room = /^Hall\s/i.test(laterRoom[1]) ? `Expo ${laterRoom[1]}` : laterRoom[1];
          }
        }
      }
    });

    data.schedule.forEach((slot: any) => {
      if (["blank"].includes(slot.kind)) {
        return;
      }
      if (slot.name == "Slot") {
        return;
      }
      if (collapseKinds.includes(slot.kind)) {
        return;
      }
      if (slot.kind == "sponsor-workshop") {
        slot.kind = "Sponsor Presentation"
      }

      if (slot.speakers) {
        slot.speakers.forEach((speaker: any) => {
          const speakerExists = this.data.speakers.find(
            (s: any) => s.id === speaker.id
          )
          if (!(speakerExists)){
            this.data.speakers.push({
              "id": speaker.id,
              "name": speaker.name,
              // only display the speaker photo if it's not null in the response.
              // otherwise, show a default fallback photo
              "profilePic": this.resolveSpeakerPhoto(speaker.photo),
              "about": speaker.bio,
            });
          }
        });
      }

      // transform any markdown slot names to regular text
      slot.name = markdownToTxt(slot.name);
      slot.preRegistered = (slot.name.includes('pre-registration') || slot.kind === "tutorial" || (slot.kind === "summit" && !/typing/i.test(slot.name))) ? true : false;
      if (slot.preRegistered) {
        slot.name = slot.name.split(', pre-registration')[0];
      }

      // For plenary-like slots, extract room from parentheses in the title
      // and strip redundant track prefix (e.g., "Keynote — " since the badge shows it)
      var sessionLocation = slot.room;
      var displayLocationOverride: string | null = null;
      const plenaryKinds = ['plenary', 'keynote', 'lightning-talks', 'event'];
      if (plenaryKinds.includes(slot.kind)) {
        const roomMatch = slot.name.match(/\s*\(([^)]+)\)\s*$/);
        if (roomMatch) {
          sessionLocation = roomMatch[1];
          slot.name = slot.name.replace(roomMatch[0], '').trim();
        }
        // Normalize bare "Hall AB"/"Hall C" to canonical "Expo Hall …" so
        // plenaries that name the venue as "Hall AB" (Opening Reception,
        // Posters, etc.) land in the same room bucket as sponsor booths /
        // posters / lunches that all live under the "Expo Hall AB" name.
        // Without this, Opening Reception ends up in a separate "Hall AB"
        // room with no other context, and the Expo Hall AB room view looks
        // like the reception isn't scheduled at all.
        if (sessionLocation && /^Hall\s/i.test(sessionLocation)) {
          sessionLocation = `Expo ${sessionLocation}`;
        }
        // Strip track prefix like "Keynote — ", "Keynote: " from name since badge shows it
        const trackPrefix = new RegExp('^' + slot.kind.replace(/-/g, '[- ]') + '\\s*[—:\\-–]\\s*', 'i');
        slot.name = slot.name.replace(trackPrefix, '').trim();
      } else if (slot.kind === 'break') {
        // Break slots fan out to every audience room (Grand Ballrooms, 103ABC,
        // 104AB, etc. — attendees in each room see "break time"). But the
        // headline location displayed in the schedule timeline should be the
        // single venue where the break service actually happens, e.g.
        // "Expo Hall AB" (coffee/snacks). Pull that out of the parenthesized
        // suffix in the slot name when present, so a slot with content
        // "Break (Expo Hall AB)" / "Coffee (Hall AB)" displays the right
        // place — but leave session.location (the comma-joined room list)
        // untouched so the per-room fanout still registers the slot in
        // every room's room-detail view.
        const roomMatch = slot.name.match(/\s*\(([^)]+)\)\s*$/);
        if (roomMatch) {
          let displayRoom = roomMatch[1].trim();
          if (/^Hall\s/i.test(displayRoom)) {
            displayRoom = `Expo ${displayRoom}`;
          }
          displayLocationOverride = displayRoom;
          slot.name = slot.name.replace(roomMatch[0], '').trim();
        }
      }

      // Flag Spanish-language sessions and strip "En Español" from title
      var isSpanish = slot.kind === 'charla' || /en espa[ñn]ol/i.test(slot.name);
      if (/,?\s*en espa[ñn]ol/i.test(slot.name)) {
        slot.name = slot.name.replace(/,?\s*en espa[ñn]ol/i, '').trim();
      }

      var start = new Date(slot.start);
      var end = new Date(slot.end);

      // Display-only start-time overrides. Some slots have a backend start
      // that's been bumped for web-grid rendering reasons (the symposion
      // timetable snaps to :00/:15/:30/:45 boundaries, so a 9:30 session
      // bleeds visually if neighbouring slots anchor :45/:00). The mobile
      // app has no grid constraint, so we surface the real attendee-facing
      // time. Match by name pattern; offset is in minutes (negative = earlier).
      // Underlying startUtc/endUtc are NOT touched so sorting, grouping,
      // and add-to-calendar continue to use the canonical timestamps.
      let displayStart = start;
      const DISPLAY_TIME_OVERRIDES: Array<{ match: RegExp; startOffsetMinutes: number }> = [
        // Talks/plenary per-room Job Fair entry: backend stores 10:00 so
        // the symposion web grid renders cleanly (9:30 would orphan the
        // row), but the real attendee start is 9:30. After markdownToTxt
        // and the (Hall AB) stripping, slot.name is exactly "Job Fair &
        // Community Showcase" — anchor with $ so we don't also match the
        // events-track row "Job Fair & Community Showcase & Poster
        // Sessions" (which is already at 9:30 and shouldn't shift).
        { match: /^\s*job\s*fair\s*&\s*community\s*showcase\s*$/i, startOffsetMinutes: -30 },
      ];
      for (const ov of DISPLAY_TIME_OVERRIDES) {
        if (ov.match.test(slot.name)) {
          displayStart = new Date(start.getTime() + ov.startOffsetMinutes * 60_000);
          break;
        }
      }

      var session: any = {
          "name": slot.name,
          "color": this.slotColors[slot.kind],
          "preRegistered": slot.preRegistered,
          "isSpanish": isSpanish,
          "listRender": slot.list_render,
          "section": slot.section,
          "location": sessionLocation,
          "displayLocationOverride": displayLocationOverride,
          "description": slot.description,
          "speakers": [],
          "speakerNames": slot.authors,
          "timeStart": displayStart.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
          "timeEnd": end.toLocaleString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
          "startUtc": slot.start,
          "endUtc": slot.end,
          "track": slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1),
          "tracks": [slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1)],
          "id": slot.conf_key,
          "day": start.toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'})
      }

      const track = this.data.tracks.find(
        (t: any) => t.name === slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1)
      )
      if (!(track)) {
        this.data.tracks.push({"name": slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1), "icon": this.getTrackIcon(slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1))})
      }

      if (slot.speakers) {
        session.speakerNames.forEach((speakerName: any) => {
          const speaker = this.data.speakers.find(
            (s: any) => s.name === speakerName
          );
          if (speaker) {
            session.speakers.push(speaker);
            speaker.sessions = speaker.sessions || [];
            speaker.sessions.push(session);
          }
        });
      }

      if (!slot.sessions) {
        this.data.sessions.push(session);
      }

      if (slot.sessions) {
        slot.sessions.forEach((shared_session, index, arr) => {
          if (shared_session.speakers) {
            shared_session.speakers.forEach((speaker: any) => {
              const speakerExists = this.data.speakers.find(
                (s: any) => s.id === speaker.id
              )
              if (!(speakerExists)){
                this.data.speakers.push({
                  "id": speaker.id,
                  "name": speaker.name,
                  // only display the speaker photo if it's not null in the response.
                  // otherwise, show a default fallback photo
                  "profilePic": this.resolveSpeakerPhoto(speaker.photo),
                  "about": speaker.bio,
                });
              }
            });
          }

          // transform any markdown shared_session names to regular text
          shared_session.name = markdownToTxt(shared_session.name);

          var start = new Date(slot.start);
          var end = new Date(slot.end);
          var session = {
              "name": shared_session.name,
              "location": slot.room,
              "description": shared_session.description,
              "speakers": [],
              "speakerNames": shared_session.authors,
              "timeStart": start.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
              "timeEnd": end.toLocaleString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
              "startUtc": slot.start,
              "endUtc": slot.end,
              "trackSlug": slot.kind + 's',
              "track": slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1),
              "tracks": [slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1)],
              "id": shared_session.conf_key,
              "day": start.toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'})
          }

          const track = this.data.tracks.find(
            (t: any) => t.name === slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1)
          )
          if (!(track)) {
            this.data.tracks.push({"name": slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1), "icon": this.getTrackIcon(slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1))})
          }

          if (shared_session.speakers) {
            session.speakerNames.forEach((speakerName: any) => {
              const speaker = this.data.speakers.find(
                (s: any) => s.name === speakerName
              );
              if (speaker) {
                session.speakers.push(speaker);
                speaker.sessions = speaker.sessions || [];
                speaker.sessions.push(session);
              }
            });
          }

          this.data.sessions.push(session);
        })
      }

      const offset = environment.utcOffset;
      var estDate= new Date(start.getTime() + (offset*3600*1000))
      var day = estDate.toISOString().split('T')[0];
      var group = start.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase();

      const scheduleDay = this.data.schedule.find(
        (d: any) => d.date === day
      );
      if (scheduleDay) {
        const scheduleDayGroup = scheduleDay.groups.find(
          (g: any) => g.time === group
        );
        if (scheduleDayGroup) {
            scheduleDayGroup.sessions.push(session)
	} else {
            scheduleDay.groups.push({"time": group, "sessions": [session], "startTime": start})
        }
      } else {
        this.data.schedule.push({"date": day, "groups": [{"time": group, "sessions": [session]}]})
      }

    });

    // Add collapsed sessions (posters, breaks, lunch)
    collapsedGroups.forEach((slot: any) => {
      var start = new Date(slot.start);
      var end = new Date(slot.end);
      var trackName = slot.kind.charAt(0).toUpperCase() + slot.kind.slice(1);
      var session = {
        "name": slot.name,
        "color": this.slotColors[slot.kind],
        "preRegistered": false,
        "listRender": false,
        "section": "",
        "location": slot.room,
        "description": "",
        "speakers": [],
        "speakerNames": [],
        "timeStart": start.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
        "timeEnd": end.toLocaleString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
        "startUtc": slot.start,
        "endUtc": slot.end,
        "track": trackName,
        "tracks": [trackName],
        "id": slot.kind + "-" + slot.room + "-" + slot.start,
        "day": start.toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'})
      };

      const track = this.data.tracks.find((t: any) => t.name === trackName);
      if (!track) {
        this.data.tracks.push({"name": trackName, "icon": this.getTrackIcon(trackName)});
      }

      this.data.sessions.push(session);

      const offset = environment.utcOffset;
      var estDate = new Date(start.getTime() + (offset * 3600 * 1000));
      var day = estDate.toISOString().split('T')[0];
      var group = start.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase();

      const scheduleDay = this.data.schedule.find((d: any) => d.date === day);
      if (scheduleDay) {
        const scheduleDayGroup = scheduleDay.groups.find((g: any) => g.time === group);
        if (scheduleDayGroup) {
          scheduleDayGroup.sessions.push(session);
        } else {
          scheduleDay.groups.push({"time": group, "sessions": [session], "startTime": start});
        }
      } else {
        this.data.schedule.push({"date": day, "groups": [{"time": group, "sessions": [session], "startTime": start}]});
      }
    });

    // Sort groups within each day by start time
    this.data.schedule.forEach((day: any) => {
      day.groups.sort((a: any, b: any) => {
        if (!a.startTime || !b.startTime) return 0;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      });
    });

    // (Distinct-tracks pass runs after poster wiring below.)

    // Build a synthetic session entry per poster so users can drill from the
    // collapsed "Posters" session list into an individual poster's detail
    // (title, abstract, speakers). They reuse the schedule's session-detail
    // route via id "poster-detail-<conf_key>".
    const collapsedPostersSession = this.data.sessions.find((s: any) => s.track === 'Poster' && s.name === 'Posters');
    this.data.posters.forEach((poster: any) => {
      const posterSpeakers = poster.speakers.map((s: any) => ({
        id: s.id,
        name: s.name,
        profilePic: s.photo,
        about: s.bio || '',
      }));
      const posterSession: any = {
        name: poster.title,
        color: this.slotColors['poster'],
        preRegistered: false,
        listRender: false,
        section: '',
        location: collapsedPostersSession?.location || 'Expo Hall AB',
        description: poster.description_html,
        speakers: posterSpeakers,
        speakerNames: posterSpeakers.map((s: any) => s.name),
        timeStart: collapsedPostersSession?.timeStart || '',
        timeEnd: collapsedPostersSession?.timeEnd || '',
        startUtc: collapsedPostersSession?.startUtc,
        endUtc: collapsedPostersSession?.endUtc,
        track: 'Poster',
        tracks: ['Poster'],
        id: `poster-detail-${poster.conf_key}`,
        day: collapsedPostersSession?.day || 'Sun',
      };
      this.data.sessions.push(posterSession);
      poster.sessionId = posterSession.id;

      // Wire the individual poster session into each poster author's
      // "Presentations" list. We deliberately skip the collapsed "Posters"
      // entry here — listing both would show their poster twice on the
      // speaker detail page (once as "Posters", once with its actual title).
      posterSpeakers.forEach((posterSpeaker: any) => {
        const speaker = this.data.speakers.find((s: any) => s.id === posterSpeaker.id);
        if (!speaker) return;
        speaker.sessions = speaker.sessions || [];
        if (!speaker.sessions.find((s: any) => s.id === posterSession.id)) {
          speaker.sessions.push(posterSession);
        }
      });
    });

    // Compute distinct tracks per speaker so the speaker list can render a
    // pill row when someone has more than one type of session (e.g. a Talk
    // and a Poster).
    this.data.speakers.forEach((speaker: any) => {
      const seen = new Set<string>();
      speaker.tracks = [];
      (speaker.sessions || []).forEach((session: any) => {
        if (!session.track || seen.has(session.track)) return;
        seen.add(session.track);
        speaker.tracks.push(session.track);
      });
    });

    // Build a per-room index. Plenaries/breaks/lunch carry comma-joined room
    // strings ("Grand Ballroom A, Grand Ballroom B") — we register the session
    // under each one so it shows up wherever the audience actually is. Each
    // session also gets a `roomLinks` array of {name, slug} so session-detail
    // can render the location as tappable pills.
    const roomMap = new Map<string, any>();
    this.data.sessions.forEach((session: any) => {
      const links: any[] = [];
      String(session.location || '')
        .split(',')
        .map((r: string) => r.trim())
        .filter(Boolean)
        .forEach((roomName: string) => {
          const slug = this.slugifyRoom(roomName);
          if (!roomMap.has(slug)) {
            roomMap.set(slug, { name: roomName, slug, sessions: [] });
          }
          roomMap.get(slug).sessions.push(session);
          if (!links.find(l => l.slug === slug)) {
            links.push({ name: roomName, slug });
          }
        });
      session.roomLinks = links;
      // Keep session.location as the comma-joined raw string (the room
      // fanout above relies on it). For the schedule timeline we show
      // only the first room — wide multi-room labels for breaks/lunch
      // wrapped onto multiple lines and looked terrible.
      // displayLocationOverride wins when set (break slots use it to
      // surface the venue where service actually happens — e.g. coffee
      // is in Expo Hall AB even though the break is registered against
      // every audience room).
      session.displayLocation = session.displayLocationOverride
        || (links.length > 0 ? links[0].name : (session.location || ''));
    });
    // Seed empty entries for sprint-only rooms. Sprints aren't in
    // data.sessions (the API ships them as a separate `sprints` array, not
    // as schedule slots), so without this the Seaside S-rooms / ballrooms
    // never appear in the Rooms list — even though they're real venues
    // attendees need to find. PYMOBIL-120.
    Object.values(ROOM_LOCATIONS).forEach((loc: any) => {
      if (!loc?.sublabel || !/sprints/i.test(loc.sublabel)) return;
      const slug = this.slugifyRoom(loc.label);
      if (!roomMap.has(slug)) {
        roomMap.set(slug, { name: loc.label, slug, sessions: [] });
      }
    });

    roomMap.forEach((room: any) => {
      room.sessions.sort(
        (a: any, b: any) =>
          new Date(a.startUtc || 0).getTime() - new Date(b.startUtc || 0).getTime()
      );
    });
    this.data.rooms = Array.from(roomMap.values()).sort((a: any, b: any) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    return this.data;
  }

  getRooms() {
    return this.load().pipe(map((data: any) => data.rooms || []));
  }

  getRoom(slug: string) {
    return this.load().pipe(
      map((data: any) => (data.rooms || []).find((r: any) => r.slug === slug))
    );
  }

  getDays(
    excludeTracks: any[] = [],
    segment = 'all'
  ) {
    return this.load().pipe(
      map((data: any) => {
        const days = []
        var index = 0;
        data.schedule.sort(function(a, b){var x = a.date; var y = b.date; return ((x < y) ? -1 : ((x > y) ? 1 : 0));}).forEach((day: any) => {
          var dateObj = new Date(day.date+"T00:00:00.000-12:00");
          days.push({"index": index.toString(), "date": day.date, "day": dateObj.toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'})});
          index += 1;
        })
        return days;
      })
    );
  }

  getTimeline(
    dayIndex: string,
    queryText = '',
    excludeTracks: any[] = [],
    segment = 'all'
  ) {
    return this.load().pipe(
      map((data: any) => {
        const day = data.schedule.sort(function(a, b){var x = a.date; var y = b.date; return ((x < y) ? -1 : ((x > y) ? 1 : 0));})[dayIndex];
        day.shownSessions = 0;

        queryText = queryText.toLowerCase().replace(/,|\.|-/g, ' ');
        const queryWords = queryText.split(' ').filter(w => !!w.trim().length);

        day.groups.forEach((group: any) => {
          group.hide = true;

          group.sessions.forEach((session: any) => {
            // check if this session should show or not
            this.filterSession(session, queryWords, excludeTracks, segment);

            if (!session.hide) {
              // if this session is not hidden then this group should show
              group.hide = false;
              day.shownSessions++;
            }
          });
        });

        return day;
      })
    );
  }

  getAllDaysTimeline(
    queryText = '',
    excludeTracks: any[] = [],
    segment = 'all'
  ) {
    return this.load().pipe(
      map((data: any) => {
        const schedule = data.schedule.sort(function(a, b){var x = a.date; var y = b.date; return ((x < y) ? -1 : ((x > y) ? 1 : 0));});
        let shownSessions = 0;
        const allGroups = [];

        queryText = queryText.toLowerCase().replace(/,|\.|-/g, ' ');
        const queryWords = queryText.split(' ').filter(w => !!w.trim().length);

        schedule.forEach((day: any) => {
          const dateObj = new Date(day.date + "T00:00:00.000-12:00");
          const dayLabel = dateObj.toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'});

          day.groups.forEach((group: any) => {
            group.hide = true;
            group.dayLabel = dayLabel;

            group.sessions.forEach((session: any) => {
              this.filterSession(session, queryWords, excludeTracks, segment);
              if (!session.hide) {
                group.hide = false;
                shownSessions++;
              }
            });

            if (!group.hide) {
              allGroups.push(group);
            }
          });
        });

        return { shownSessions, groups: allGroups };
      })
    );
  }

  getSessions(
    queryText = '',
    excludeTracks: any[] = [],
  ) {
    return this.load().pipe(
      map((data: any) => {
        const sessions = []

        queryText = queryText.toLowerCase().replace(/,|\.|-/g, ' ');
        const queryWords = queryText.split(' ').filter(w => !!w.trim().length);

        data.sessions.forEach((session: any) => {
          // check if this session should show or not
          this.filterSession(session, queryWords, excludeTracks, 'all');
          if (!session.hide) {
            sessions.push(session);
          }
        });

        sessions.sort((a, b) => {
          const aTime = a.startUtc ? new Date(a.startUtc).getTime() : 0;
          const bTime = b.startUtc ? new Date(b.startUtc).getTime() : 0;
          if (aTime && bTime && aTime !== bTime) return aTime - bTime;
          // Fallback for sessions missing startUtc (defensive — shouldn't happen
          // for normal track sessions, but keep behavior stable).
          return this.parseTime(a.timeStart || '') - this.parseTime(b.timeStart || '');
        });

        return sessions;
      })
    );
  }

  parseTime(timeString) {
    const [time, period] = timeString.trim().toLowerCase().split(/([ap]m)/);
    let [hours, minutes] = time.split(':').map(Number);
    if ((period||'').includes('p') && hours < 12) {
      hours += 12;
    } else if ((period||'').includes('a') && hours === 12) {
             hours = 0;
           }
    return hours * 60 + (minutes || 0);
  }

  filterSession(
    session: any,
    queryWords: string[],
    excludeTracks: any[],
    segment: string
  ) {
    let matchesQueryText = false;
    if (queryWords.length) {
      // of any query word is in the session name than it passes the query test
      queryWords.forEach((queryWord: string) => {
        if (session.name.toLowerCase().indexOf(queryWord) > -1) {
          matchesQueryText = true;
        }
        if (session.description) {
          if (session.description.toLowerCase().indexOf(queryWord) > -1) {
            matchesQueryText = true;
          }
        }
        session.speakers.forEach((speaker: any) => {
          if (speaker.name.toLowerCase().indexOf(queryWord) > -1) {
            matchesQueryText = true;
          }
        });
      });
    } else {
      // if there are no query words then this session passes the query test
      matchesQueryText = true;
    }

    // if any of the sessions tracks are not in the
    // exclude tracks then this session passes the track test
    let matchesTracks = false;
    session.tracks.forEach((trackName: string) => {
      if (excludeTracks.indexOf(trackName) === -1) {
        matchesTracks = true;
      }
    });

    // if the segment is 'favorites', but session is not a user favorite
    // then this session does not pass the segment test
    let matchesSegment = false;
    if (this.user.hasFavorite(session.id)) {
      session.favorite = true;
    } else {
      session.favorite = false;
    }
    if (segment === 'favorites') {
      if (session.favorite) {
        matchesSegment = true;
      }
    } else {
      matchesSegment = true;
    }

    // all tests must be true if it should not be hidden
    session.hide = !(matchesQueryText && matchesTracks && matchesSegment);
  }

  getSponsors() {
    return this.load().pipe(
      map((data: any) => {
        return data.conference.sponsors;
      })
    );
  }

  getContent() {
    return this.load().pipe(
      map((data: any) => {
        return data.conference.content;
      })
    );
  }

  getSprints() {
    return this.load().pipe(
      map((data: any) => {
        return data.sprints || [];
      })
    );
  }

  getPosters() {
    return this.load().pipe(
      map((data: any) => {
        return data.posters || [];
      })
    );
  }

  getJobListings() {
    return this.load().pipe(
      map((data: any) => {
        return data['job-listings'] || [];
      })
    );
  }

  querySponsors(queryText: string) {
    queryText = queryText.toLowerCase().replace(/,|\.|-/g, ' ');
    const queryWords = queryText.split(' ').filter(w => !!w.trim().length);
    return this.load().pipe(
      map((data: any) => {
        const results = [];
        for (const [level, sponsorss] of Object.entries(data.conference.sponsors)) {
          for(const [index, sponsor] of Object.entries(sponsorss)) {
            if (this.filterSponsors(sponsor, queryWords)) {
              if (sponsor.booth_number !== null) {
                results.push(sponsor);
              }
            }
          }
        }
        return results;
      })
    );
  }


  filterSponsors(
    sponsor: any,
    queryWords: string[],
  ) {
    let matchesQueryText = false;
    if (queryWords.length) {
      // of any query word is in the speaker name than it passes the query test
      queryWords.forEach((queryWord: string) => {
        if (sponsor.name.toLowerCase().indexOf(queryWord) > -1) {
          console.log(sponsor.name);
          matchesQueryText = true;
        }
      });
    } else {
      // if there are no query words then this session passes the query test
      matchesQueryText = true;
    }

    // all tests must be true if it should not be hidden
    return matchesQueryText
  }

  getSpeakers(queryText: string) {
    queryText = queryText.toLowerCase().replace(/,|\.|-/g, ' ');
    const queryWords = queryText.split(' ').filter(w => !!w.trim().length);
    return this.load().pipe(
      map((data: any) => {
        data.speakers.forEach((speaker: any) => {
          this.filterSpeaker(speaker, queryWords);
        });
        return data.speakers.sort((a: any, b: any) => {
          const aName = a.name.split(' ').pop();
          const bName = b.name.split(' ').pop();
          return aName.localeCompare(bName);
        });
      })
    );
  }

  filterSpeaker(
    speaker: any,
    queryWords: string[],
  ) {
    let matchesQueryText = false;
    if (queryWords.length) {
      // of any query word is in the speaker name than it passes the query test
      queryWords.forEach((queryWord: string) => {
        if (speaker.name.toLowerCase().indexOf(queryWord) > -1) {
          matchesQueryText = true;
        }
      });
    } else {
      // if there are no query words then this session passes the query test
      matchesQueryText = true;
    }

    // all tests must be true if it should not be hidden
    speaker.hide = !(matchesQueryText)
  }

  getTracks() {
    return this.load().pipe(
      map((data: any) => {
        return data.tracks.sort();
      })
    );
  }
}
