import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { of, Observable } from 'rxjs';
import { map, timeout, catchError, shareReplay } from 'rxjs/operators';
import { Storage } from '@ionic/storage-angular';
import { ToastController } from '@ionic/angular';
import markdownToTxt from 'markdown-to-txt';

import { UserData } from './user-data';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ConferenceData {
  data: any;
  private loadObservable: Observable<any> | null = null;
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
  };

  getTrackIcon(trackName: string): string {
    return this.trackIcons[trackName] || 'mic-outline';
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
    this.loadObservable = null;
    this.storage.remove('schedule-cache');
  }

  load(): Observable<any> {
    if (this.data) {
      return of(this.data);
    }

    // If a load is already in flight, share it instead of creating a duplicate
    if (this.loadObservable) {
      return this.loadObservable;
    }

    this.loadObservable = new Observable(observer => {
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
        // Storage read failed, go straight to network
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
    }).pipe(
      shareReplay({ bufferSize: 1, refCount: false })
    );

    // Clear the in-flight observable once it completes or errors
    this.loadObservable.subscribe({
      complete: () => { this.loadObservable = null; },
      error: () => { this.loadObservable = null; },
    });

    return this.loadObservable;
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
    };

    data['open-spaces'].forEach((openSpace: any) => {
      var start = new Date(openSpace.start);
      var end = new Date(openSpace.end);
      var session = {
        "name": openSpace.title,
        "color": 'light',
        "preRegistered": false,
        "listRender": true,
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
        "tracks": ["open-space"],
        "id": openSpace.conf_key + 9000,
        "day": start.toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'}),
        "imageUrl": openSpace.image_url,
      }
      this.data.sessions.push(session);
    });

    // Collapse repeating slots (posters, breaks) into single entries per day/time
    const collapseKinds = ['poster', 'break'];
    const collapsedGroups = new Map<string, any>();
    data.schedule.filter((s: any) => collapseKinds.includes(s.kind)).forEach((slot: any) => {
      const day = new Date(slot.start).toLocaleDateString('en-us', {timeZone: environment.timezone, weekday: 'short'});
      const slotName = markdownToTxt(slot.name);
      const key = `${slot.kind}-${day}-${slotName}`;
      if (!collapsedGroups.has(key)) {
        // Rename lunchtime breaks
        let name = slot.kind === 'poster' ? 'Posters' : markdownToTxt(slot.name);
        if (slot.kind === 'break' && (name === 'Break' || name === 'break')) {
          const slotHour = parseInt(new Date(slot.start).toLocaleTimeString([], {timeZone: environment.timezone, hour12: false, hour: 'numeric'}));
          if (['Fri', 'Sat', 'Sun'].includes(day) && slotHour >= 12 && slotHour < 14) {
            name = 'Lunch';
          }
        }
        // Extract room from parentheses in name (e.g., "Lunch (Hall C)" → room="Hall C")
        // For breaks without parenthesized room, just use first room from comma-separated list
        let room = slot.room;
        const roomMatch = name.match(/\s*\(([^)]+)\)\s*$/);
        if (roomMatch) {
          room = roomMatch[1];
          name = name.replace(roomMatch[0], '').trim();
        } else if (slot.kind === 'break' && room && room.includes(',')) {
          room = '';
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
            group.room = laterRoom[1];
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
              "profilePic": speaker.photo ? speaker.photo : 'assets/img/person-circle-outline.png',
              "about": speaker.bio,
            });
          }
        });
      }

      // transform any markdown slot names to regular text
      slot.name = markdownToTxt(slot.name);
      slot.preRegistered = (slot.name.includes('pre-registration') || slot.kind === "tutorial")? true : false;
      if (slot.preRegistered) {
        slot.name = slot.name.split(', pre-registration')[0];
      }

      // For plenary-like slots, extract room from parentheses in the title
      // and strip redundant track prefix (e.g., "Keynote — " since the badge shows it)
      var sessionLocation = slot.room;
      const plenaryKinds = ['plenary', 'keynote', 'lightning-talks', 'event'];
      if (plenaryKinds.includes(slot.kind)) {
        const roomMatch = slot.name.match(/\s*\(([^)]+)\)\s*$/);
        if (roomMatch) {
          sessionLocation = roomMatch[1];
          slot.name = slot.name.replace(roomMatch[0], '').trim();
        }
        // Strip track prefix like "Keynote — ", "Keynote: " from name since badge shows it
        const trackPrefix = new RegExp('^' + slot.kind.replace(/-/g, '[- ]') + '\\s*[—:\\-–]\\s*', 'i');
        slot.name = slot.name.replace(trackPrefix, '').trim();
      }

      // Flag Spanish-language sessions and strip "En Español" from title
      var isSpanish = slot.kind === 'charla' || /en espa[ñn]ol/i.test(slot.name);
      if (/,?\s*en espa[ñn]ol/i.test(slot.name)) {
        slot.name = slot.name.replace(/,?\s*en espa[ñn]ol/i, '').trim();
      }

      var start = new Date(slot.start);
      var end = new Date(slot.end);
      var session = {
          "name": slot.name,
          "color": this.slotColors[slot.kind],
          "preRegistered": slot.preRegistered,
          "isSpanish": isSpanish,
          "listRender": slot.list_render,
          "section": slot.section,
          "location": sessionLocation,
          "description": slot.description,
          "speakers": [],
          "speakerNames": slot.authors,
          "timeStart": start.toLocaleTimeString([], {timeZone: environment.timezone, hour: 'numeric', minute:'2-digit'}).toLowerCase(),
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
                  "profilePic": speaker.photo ? speaker.photo : 'assets/img/person-circle-outline.png',
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

    return this.data;
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

        if (sessions.length > 0 && sessions[0].track === "Open Space") {
          const dayPriority = { "Fri": 0, "Sat": 1, "Sun": 2 };
          sessions.sort((a, b) => {
            const dayDiff = (dayPriority[a.day] || 0) - (dayPriority[b.day] || 0);
            return dayDiff || this.parseTime(a.timeStart) - this.parseTime(b.timeStart);
          });
        }

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
