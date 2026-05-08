import { Component, OnDestroy } from '@angular/core';
import { InAppBrowser, DefaultWebViewOptions } from '@capacitor/inappbrowser';
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ModalController, Platform, ToastController } from '@ionic/angular';
import { ConferenceData } from '../../providers/conference-data';
import { ActivatedRoute } from '@angular/router';
import { UserData } from '../../providers/user-data';
import { LiveUpdateService } from '../../providers/live-update.service';
import { Location } from '@angular/common';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FloorPlanModalComponent } from '../../floor-plan-modal/floor-plan-modal.component';

interface KeynoteAbstract {
  match: string[];
  title?: string;
  eyebrow?: string;
  paragraphs: string[];
  // Names from `keynoteSpeakers` to render alongside the abstract. Used
  // for panels (D&I Panel, Steering Council, etc.) where the session
  // title doesn't include the speaker names directly so the substring
  // match below can't pick them up.
  panelists?: string[];
}

@Component({
  selector: 'page-session-detail',
  styleUrls: ['./session-detail.scss'],
  templateUrl: 'session-detail.html'
})
export class SessionDetailPage implements OnDestroy {
  session: any;
  isFavorite = false;
  isOpenSpace = false;
  isKeynote = false;
  isPosters = false;
  isJobFair = false;
  posters: any[] = [];
  keynoteData: any[] = [];
  keynoteAbstract: KeynoteAbstract | null = null;
  defaultHref = '';
  private paramSub?: Subscription;

  private keynoteAbstracts: KeynoteAbstract[] = [
    {
      match: ['Djangonaut', 'Rachell Calhoun', 'Tim Schilling'],
      title: 'Djangonaut Space',
      eyebrow: 'Joint keynote by Tim Schilling & Rachell Calhoun',
      paragraphs: [
        'Permission to board granted. Find out how we\u2019ve empowered people to contribute to Django, the third-party ecosystem, and the broader community.',
        'Djangonaut Space is a contributor mentorship program for the Django framework. It centers around a free, 8-week group mentoring session where individuals will work self-paced in a semi-structured learning environment. The program launched its pilot session at the end of 2023 with Session 6 touching down in April of 2026.',
        'The program started with the lofty goals of making contributing to Django more sustainable, helping people level up their Django code contributions, increasing diversity among our code contributors, and setting them up for leadership roles.',
        'After seven iterations in three years, we are seeing the long-term payoffs. We\u2019re increasing contributions, developing leaders, and we\u2019ve seen how an inclusive environment that actively welcomes people in can fuel contributors on their own open-source journeys.',
        'And yes, space puns intended.',
      ],
    },
    {
      match: ['Lin Qiao'],
      title: 'Your AI Product Doesn\u2019t Have a Moat\u2026 Yet',
      paragraphs: [
        'Every company shipping an AI product faces the same problem: if you\u2019re calling someone else\u2019s API, you\u2019re building on rented land. Your competitor can make the same API call tomorrow and ship the same feature. The companies pulling ahead design their products and models concurrently.',
        'Lin Qiao, CEO of Fireworks AI, will share examples from Cursor, Notion and Vercel \u2014 teams that integrated fine-tuned models into production to unlock features, cut latency and push code generation past SOTA. What they all have in common is a design pattern of tight feedback loops: when a user corrects an output or finds a better solution, that data improves the model, which improves the product, which generates better data. The product and model evolve together.',
        'Lin will break down what this loop looks like in practice \u2014 evaluation frameworks, RFT workflows, infrastructure decisions \u2014 and cover the hard tradeoffs: when to fine-tune vs. prompt engineer, how to treat cost and latency as first-class design constraints, and why handing your data to a third-party API might build your competitor\u2019s next training set.',
      ],
    },
    {
      match: ['Pablo Galindo', 'Horizonte de sucesos', 'Event Horizon'],
      title: 'Horizonte de sucesos / Event Horizon',
      paragraphs: [
        'Espa\u00f1ol \u2014 Mantener uno de los lenguajes de programaci\u00f3n m\u00e1s usados del mundo no es solo cuesti\u00f3n de c\u00f3digo. Es cargar con decisiones que afectan a millones de personas, ser parte de una comunidad que nunca duerme, y encontrar razones para seguir cuando nadie te lo pide y nadie te paga por hacerlo. El mundo del software est\u00e1 cambiando, y con \u00e9l, las reglas del juego para quienes lo sostienen desde dentro. En esta charla compartir\u00e9 lo que he aprendido despu\u00e9s de a\u00f1os en las trincheras del open source: qu\u00e9 significa realmente ser maintainer, qu\u00e9 se gana, qu\u00e9 se pierde, y por qu\u00e9 a pesar de todo sigue mereciendo la pena.',
        'English \u2014 Maintaining one of the most widely used programming languages in the world is not just a matter of code. It means carrying decisions that affect millions of people, being part of a community that never sleeps, and finding reasons to keep going when nobody asks you to and nobody pays you for it. The world of software is shifting, and with it, the rules of the game for those who hold it together from the inside. In this talk I will share what I have learned after years in the trenches of open source: what it really means to be a maintainer, what you gain, what you lose, and why in spite of everything it is still worth it.',
      ],
    },
    {
      match: ['Diversity & Inclusion Panel', 'D&I Panel', 'Python is for Everyone'],
      title: 'D&I Panel: Python is for Everyone \u2014 Growing the Community Without Limits',
      eyebrow: 'Panel hosted by the PSF Diversity & Inclusion Workgroup',
      paragraphs: [
        'A panel from the PSF Diversity & Inclusion Workgroup on growing the Python community without limits \u2014 bringing together organizers and contributors from PyLadies chapters across Brazil, the U.S., Ghana, and Malaysia.',
      ],
      panelists: [
        'Jules',
        'D\u00e9bora Azevedo',
        'Alla Barbalat',
        'Georgi Ker',
        'Theresa Seyram Agbenyegah',
        'Abhijeet Mote',
      ],
    },
    {
      match: ['Steering Council Panel', 'Steering Council'],
      title: 'Python Steering Council Panel',
      eyebrow: 'Annual address from the Python Steering Council',
      paragraphs: [
        'The Python Steering Council is a 5-person elected committee that assumes a mandate to maintain the quality and stability of the Python language and CPython interpreter, improve the contributor experience, formalize and maintain a relationship between the Python core team and the PSF, establish decision making processes for Python Enhancement Proposals, seek consensus among contributors and the Python core team, and resolve decisions and disputes in decision making among the language.',
      ],
      panelists: [
        'Barry Warsaw',
        'Donghee Na',
        'Pablo Galindo Salgado',
        'Savannah Ostrowski',
        'Thomas Wouters',
      ],
    },
    {
      // Amanda's keynote-speakers page entry has no abstract title yet \u2014
      // this is rendered as a single body paragraph. Source:
      // https://us.pycon.org/2026/about/keynote-speakers/#amanda-casari
      match: ['amanda casari', 'Amanda Casari'],
      paragraphs: [
        'amanda casari is an engineer and researcher who has worked in many technical and socio-technical disciplines for over 20 years, including developer relations, product management, data science, and underwater robotics. amanda was named an External Faculty member of the Vermont Complex Systems Center in 2021 and co-authored Feature Engineering for Machine Learning Principles and Techniques for Data Scientists for O\u2019Reilly. amanda is persistently fascinated by complexity, the differences between the systems we aim to create and the ones that emerge, roller derby, and pie.',
      ],
    },
  ];

  private keynoteSpeakers: Record<string, any> = {
    'Lin Qiao': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/lin_qiao.original.jpg',
      bio: 'Lin Qiao is the CEO and co-founder of global AI inference cloud and infrastructure platform Fireworks AI, enables teams like Cursor, Uber, DoorDash, and Shopify to build, tune, and scale highly optimized generative AI applications. Prior to founding Fireworks, Lin was the co-creator and head of Meta\'s PyTorch.',
    },
    'amanda casari': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/amcasari-headshot.original.png',
      bio: 'amanda casari is an engineer and researcher who has worked in many technical and socio-technical disciplines for over 20 years, including developer relations, product management, data science, and underwater robotics.',
    },
    'Tim Schilling': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Tim_Schilling.original.jpg',
      bio: 'A software engineer that loves Django and our community. On the Django Steering Council, a cofounder of Djangonaut Space and an admin of Django Commons.',
    },
    'Rachell Calhoun': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/rachell_calhoun.original.jpg',
      bio: 'Co-founder of Djangonaut Space and a Django developer. Organized Django Girls workshops across multiple countries and continents for over 10 years.',
    },
    'Pablo Galindo Salgado': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Pablo_Galindo_Salgado.original.jpg',
      bio: 'CPython core developer and Theoretical Physicist. Currently serving on the Python Steering Council in his 6th term and release manager for Python 3.10 and 3.11.',
    },
    // D&I Panel — six panelists. The session-detail enrichment matches by
    // substring on the session name; for the panel, the talk name is
    // "Diversity & Inclusion Panel" and the panelist names below all
    // appear in the abstract paragraphs above. Keep these names in lowercase
    // for case-insensitive matching when needed.
    'Jules': {
      photo: 'assets/img/person-circle-outline.png',
      bio: 'Jules (they/them, she/her) is a nonbinary Brazilian who is PyLadies Recife and PyLadies Brasil Co-organizer. Fullstack developer by daylight and artist by moonlight, they are always eager to support event organizers and help provide a more inclusive community at the Diversity and Inclusion Workgroup from PSF. Former board member from Python Brazil Association (APyB) from 2022 to 2026. AuDHD and STEMinist.',
    },
    'Débora Azevedo': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/deborah.original.png',
      bio: 'Débora is a public school teacher in Brazil, and one of the cofounders of PyLadies Brazil, the largest PyLadies chapter in the world. She’s a PhD student and she researches educational software development. She’s currently one of the organizers of Python Nordeste, a regional Python conference in Brazil, and a former PSF board member (2021–2024).',
    },
    'Alla Barbalat': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/alla.original.png',
      bio: 'Alla Barbalat began her career as a lawyer before transitioning into tech. She is the lead organizer of PyLadies San Francisco, an avid Python user, and a speaker on topics at the intersection of Python, AI, and law.',
    },
    'Georgi Ker': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/georgi.original.jpg',
      bio: 'Georgi Ker is the Director and a Fellow of the Python Software Foundation. She co-organizes PyLadiesCon and chairs the D&I Workgroup within the PSF. She is also one of the co-hosts of the podcast series "The Hidden Figures of Python" alongside Mariatta Wijaya, Cheuk Ting Ho, and Tereza Iofciu.',
    },
    'Theresa Seyram Agbenyegah': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Stancy-Portrait.original.jpg',
      bio: 'Theresa Seyram Agbenyegah (mostly referred to in the Tech community as Stancy) is a Software Engineer, Open-Source advocate, and Social Entrepreneur. She currently serves as the Programmes and Events Lead for PyLadies Ghana and is a member of Python Ghana. She is a DSF member and a member of the DSF event support working group, a PSF Diversity and Inclusion workgroup member, an Outreach ambassador for the CHAOSS DEI workgroup, and a Django Girls organizer.',
    },
    'Abhijeet Mote': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/MNTN_Matt-Lief-Anderson_2856-Edit.original.jpg',
      bio: 'Abhijeet is a Lead Python AI Engineer and Fellow of the Python Software Foundation. He founded Python Penang, Malaysia, where he has helped grow the local developer community. He has spoken at international conferences including PyCon Italy, runs workshops, and mentors students and underrepresented groups in technology. His work focuses on scalable Python AI systems, distributed systems, data pipelines, and LLM-based applications across adtech, semiconductor, and healthcare.',
    },
    // Python Steering Council panelists. Pablo is already above with his
    // standalone keynote bio — kept that copy; the Steering Council panel
    // pulls all five via the abstract's `panelists` list.
    'Barry Warsaw': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Barry_PyCon.max-165x165.jpg',
      bio: 'Python Steering Council member.',
    },
    'Donghee Na': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/donghee_na.max-165x165.jpg',
      bio: 'Python Steering Council member and CPython core developer.',
    },
    'Savannah Ostrowski': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/savannah.max-165x165.jpg',
      bio: 'Python Steering Council member.',
    },
    'Thomas Wouters': {
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Thomas_Wouters.max-165x165.jpg',
      bio: 'Python Steering Council member, CPython core developer, and release manager.',
    },
  };

  constructor(
    private dataProvider: ConferenceData,
    private userProvider: UserData,
    private route: ActivatedRoute,
    public liveUpdateService: LiveUpdateService,
    private location: Location,
    private platform: Platform,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
  ) { }

  ionViewWillEnter() {
    // Subscribe to param changes so navigating between sessions on the same
    // route (e.g. tapping an individual poster from the collapsed Posters list)
    // re-renders with the new session instead of reusing the stale snapshot.
    this.paramSub?.unsubscribe();
    this.paramSub = this.route.paramMap.subscribe((params) => {
      const sessionId = params.get('sessionId');
      this.loadSession(sessionId);
    });
  }

  ionViewWillLeave() {
    this.paramSub?.unsubscribe();
    this.paramSub = undefined;
  }

  ngOnDestroy() {
    this.paramSub?.unsubscribe();
  }

  private loadSession(sessionId: string | null) {
    this.dataProvider.load().subscribe((data: any) => {
      if (!data?.sessions) return;
      const foundSession = data.sessions.find(
        (s: any) => String(s.id) === String(sessionId)
      );
      this.session = foundSession;
      this.isOpenSpace = this.session?.track === 'Open Space' || this.session?.tracks?.includes('Open Space');
      this.isKeynote = this.session?.tracks?.includes('keynote') || this.session?.track === 'Keynote';
      // Panels (D&I, Steering Council) ship as kind="plenary" not
      // "keynote", so isKeynote is false — but they still need the
      // panelist photos + abstract treatment. Detect by name pattern.
      const isPanel =
        typeof this.session?.name === 'string' &&
        /(?:diversity\s*(?:&|and)\s*inclusion\s+panel|steering\s+council\s+panel)/i.test(this.session.name);
      // Only the *collapsed* "Posters" schedule slot lists every poster;
      // individual poster session-detail pages show their own description.
      this.isPosters = this.session?.track === 'Poster' && this.session?.name === 'Posters';
      this.posters = this.isPosters ? (data.posters || []) : [];
      const jobFairHaystack = [
        this.session?.name,
        this.session?.content_override,
      ]
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .toLowerCase();
      this.isJobFair = jobFairHaystack.includes('job fair');
      this.keynoteData = [];
      this.keynoteAbstract = null;

      // Enrich keynote and panel sessions with speaker photo/bio.
      // Keynotes match by substring on the session title (works because
      // a keynote's title typically includes the speaker's name).
      // Panels (D&I, Steering Council) match by abstract: the abstract
      // entry carries an explicit `panelists` list of names to render,
      // since the session title doesn't name them.
      if (this.isKeynote || isPanel) {
        const sessionName = (this.session?.name || '').toLowerCase();
        this.keynoteAbstract = this.keynoteAbstracts.find(
          (a) => a.match.some((m) => sessionName.includes(m.toLowerCase()))
        ) || null;
        if (this.keynoteAbstract?.panelists?.length) {
          this.keynoteData = this.keynoteAbstract.panelists
            .map((name) => {
              const data = this.keynoteSpeakers[name];
              return data ? { name, ...data } : null;
            })
            .filter((entry): entry is { name: string; photo: string; bio: string } => entry !== null);
        } else {
          this.keynoteData = Object.entries(this.keynoteSpeakers)
            .filter(([name]) => sessionName.includes(name.toLowerCase()))
            .map(([name, data]) => ({ name, ...data }));
        }
      }

      if (this.session?.id != null) {
        this.isFavorite = this.userProvider.hasFavorite(String(this.session.id));
      }
    });
  }

  ionViewDidEnter() {
    // Honor a prevUrl query param so the back button returns to the page
    // the user came from (e.g. /app/tabs/tracks/open-spaces, a speaker page,
    // a room-detail page) rather than always dumping them on the schedule
    // root. Matches speaker-detail / sponsor-detail behavior. Defaults to
    // the schedule tab for deep-links and direct opens. See PYMOBIL-116.
    this.defaultHref =
      this.route.snapshot.queryParamMap.get('prevUrl') || '/app/tabs/schedule';
  }

  sessionClick(item: string) {
    console.log('Clicked', item);
  }

  toggleFavorite() {
    if (this.userProvider.hasFavorite(String(this.session.id))) {
      this.userProvider.removeFavorite(String(this.session.id));
      this.isFavorite = false;
    } else {
      this.userProvider.addFavorite(String(this.session.id));
      this.isFavorite = true;
    }
  }

  async addToCalendar() {
    if (!this.session) return;

    // Validate session timestamps up front; the native plugin and the .ics
    // fallback both produce broken results if these are NaN.
    const startMs = new Date(this.session.startUtc).getTime();
    const endMs = new Date(this.session.endUtc).getTime();
    if (
      !this.session.startUtc ||
      !this.session.endUtc ||
      Number.isNaN(startMs) ||
      Number.isNaN(endMs)
    ) {
      await this.presentToast('Couldn’t read this session’s time');
      return;
    }

    const speakers = this.session.speakers?.map((s: any) => s.name).join(', ') || '';
    const sessionUrl = environment.baseUrl + '/2026/schedule/presentation/' + this.session.id + '/';
    const descriptionParts: string[] = [];
    if (speakers) descriptionParts.push(`Speakers: ${speakers}`);
    descriptionParts.push(sessionUrl);
    const description = descriptionParts.join('\n\n');

    // Native: hand the event to the OS calendar prompt so the user adds it
    // to whatever calendar they've configured (iOS Calendar, Google
    // Calendar on Android, etc.). If the prompt fails (permission denied,
    // plugin error) fall through to the .ics share sheet so they can still
    // open it in their preferred calendar app — never force Google.
    if (this.platform.is('hybrid')) {
      try {
        await CapacitorCalendar.requestWriteOnlyCalendarAccess();
        await CapacitorCalendar.createEventWithPrompt({
          title: this.session.name,
          location: this.session.location || '',
          description,
          startDate: startMs,
          endDate: endMs,
          isAllDay: false,
          url: sessionUrl,
        });
        return;
      } catch (err) {
        console.error('Native calendar prompt failed, falling back to .ics', err);
      }
      try {
        await this.shareIcs(startMs, endMs, description);
      } catch (err) {
        console.error('Sharing .ics failed', err);
        await this.presentToast('Couldn’t open the calendar app');
      }
      return;
    }

    // Web/PWA: trigger an .ics download. The browser/OS hands it to the
    // user's default calendar app — Apple Calendar, Outlook, Google Cal,
    // whatever they've registered for text/calendar.
    this.downloadIcs(startMs, endMs, description);
  }

  private buildIcs(startMs: number, endMs: number, description: string): string {
    const stamp = this.formatIcsDate(new Date());
    const sessionId = this.session?.id ?? 'unknown';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PyCon US//Mobile App//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:pycon-2026-${sessionId}@us.pycon.org`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${this.formatIcsDate(new Date(startMs))}`,
      `DTEND:${this.formatIcsDate(new Date(endMs))}`,
      `SUMMARY:${this.escapeIcsText(this.session?.name || '')}`,
      `LOCATION:${this.escapeIcsText(this.session?.location || '')}`,
      `DESCRIPTION:${this.escapeIcsText(description)}`,
      `URL:${this.escapeIcsText(environment.baseUrl + '/2026/schedule/presentation/' + sessionId + '/')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    // ICS requires CRLF line endings.
    return lines.join('\r\n') + '\r\n';
  }

  private escapeIcsText(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\n|\r/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  private formatIcsDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
    );
  }

  private icsFilename(): string {
    const slug = String(this.session?.name || 'pycon-session')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'pycon-session';
    return `${slug}.ics`;
  }

  private downloadIcs(startMs: number, endMs: number, description: string) {
    const ics = this.buildIcs(startMs, endMs, description);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.icsFilename();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async shareIcs(startMs: number, endMs: number, description: string) {
    const ics = this.buildIcs(startMs, endMs, description);
    const filename = this.icsFilename();
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: ics,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: this.session?.name || 'PyCon Session',
      text: this.session?.name || 'PyCon Session',
      url: writeResult.uri,
      dialogTitle: 'Add to calendar',
    });
  }

  private async presentToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
    });
    await toast.present();
  }

  onDescriptionClick(event: Event) {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a') as HTMLAnchorElement;
    if (anchor) {
      event.preventDefault();
      let href = anchor.getAttribute('href');
      if (href) {
        // Resolve relative URLs against us.pycon.org
        if (href.startsWith('/')) {
          href = environment.baseUrl + href;
        }
        InAppBrowser.openInWebView({ url: href, options: DefaultWebViewOptions });
      }
    }
  }

  shareSession() {
    console.log('Clicked share session');
  }

  async openJobFairFloorPlan() {
    const modal = await this.modalCtrl.create({
      component: FloorPlanModalComponent,
      componentProps: {
        title: 'Job Fair & Community Showcase',
        imageSrc: 'assets/img/floor-plans/job-fair.jpg',
        altText: 'Job Fair & Community Showcase floor plan',
      },
    });
    await modal.present();
  }
}
