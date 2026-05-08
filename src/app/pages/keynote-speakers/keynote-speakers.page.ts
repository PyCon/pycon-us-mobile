import { Component, ViewChild, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { LiveUpdateService } from '../../providers/live-update.service';
import { ConferenceData } from '../../providers/conference-data';

interface KeynoteSpeaker {
  name: string;
  photo: string;
  bio: string;
  session?: any;
}

interface SteeringCouncilMember {
  name: string;
  photo: string;
}

interface SteeringCouncil {
  name: string;
  members: SteeringCouncilMember[];
  bio: string;
  session?: any;
}

interface PanelMember {
  name: string;
  photo: string | null;
  bio: string;
}

interface Panel {
  name: string;
  eyebrow: string;
  members: PanelMember[];
  intro: string;
  session?: any;
}

@Component({
  selector: 'app-keynote-speakers',
  templateUrl: './keynote-speakers.page.html',
  styleUrls: ['./keynote-speakers.page.scss'],
})
export class KeynoteSpeakersPage implements OnInit {
  @ViewChild(IonContent) content: IonContent;
  showTitle = false;

  speakers: KeynoteSpeaker[] = [
    {
      name: 'Lin Qiao',
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/lin_qiao.original.jpg',
      bio: 'Lin Qiao is the CEO and co-founder of global AI inference cloud and infrastructure platform Fireworks AI, enables teams like Cursor, Uber, DoorDash, and Shopify to build, tune, and scale highly optimized generative AI applications. Prior to founding Fireworks, Lin was the co-creator and head of Meta\'s PyTorch.',
    },
    {
      name: 'amanda casari',
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/amcasari-headshot.original.png',
      bio: 'amanda casari is an engineer and researcher who has worked in many technical and socio-technical disciplines for over 20 years, including developer relations, product management, data science, and underwater robotics. amanda was named an External Faculty member of the Vermont Complex Systems Center in 2021 and co-authored Feature Engineering for Machine Learning Principles and Techniques for Data Scientists for O\'Reilly.',
    },
    {
      name: 'Tim Schilling',
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Tim_Schilling.original.jpg',
      bio: 'I\'m a software engineer that loves Django and our community. I\'m on the Django Steering Council, a cofounder of Djangonaut Space and an admin of Django Commons. I\'ve been helping maintain django-debug-toolbar and a few other packages.',
    },
    {
      name: 'Rachell Calhoun',
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/rachell_calhoun.original.jpg',
      bio: 'I\'m Rachell, co-founder of Djangonaut Space and a Django developer. I love building practical, user-friendly tools and creating communities where people walk away with new skills, confidence, and some new friends. I\'ve organized Django Girls workshops across multiple countries and continents for over 10 years.',
    },
    {
      name: 'Pablo Galindo Salgado',
      photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Pablo_Galindo_Salgado.original.jpg',
      bio: 'Pablo Galindo Salgado works in the Python team of Hudson River Trading. He is a CPython core developer and a Theoretical Physicist specializing in general relativity and black hole physics. He is currently serving on the Python Steering Council in his 6th term and he is the release manager for Python 3.10 and 3.11.',
    },
  ];

  steeringCouncil: SteeringCouncil = {
    name: 'Python Steering Council',
    members: [
      { name: 'Barry Warsaw', photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Barry_PyCon.max-165x165.jpg' },
      { name: 'Donghee Na', photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/donghee_na.max-165x165.jpg' },
      { name: 'Pablo Galindo Salgado', photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Pablo_Galindo_Salgado.max-165x165.jpg' },
      { name: 'Savannah Ostrowski', photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/savannah.max-165x165.jpg' },
      { name: 'Thomas Wouters', photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Thomas_Wouters.max-165x165.jpg' },
    ],
    bio: 'The Python Steering Council is a 5-person elected committee that assumes a mandate to maintain the quality and stability of the Python language and CPython interpreter, improve the contributor experience, formalize and maintain a relationship between the Python core team and the PSF, establish decision making processes for Python Enhancement Proposals, seek consensus among contributors and the Python core team, and resolve decisions and disputes in decision making among the language.',
  };

  diversityPanel: Panel = {
    name: 'D&I Panel: Python is for Everyone — Growing the Community Without Limits',
    eyebrow: 'Hosted by the PSF Diversity & Inclusion Workgroup',
    intro:
      'A panel from the PSF Diversity & Inclusion Workgroup on growing the Python community without limits — bringing together organizers and contributors from PyLadies chapters across Brazil, the U.S., Ghana, and Malaysia.',
    members: [
      {
        name: 'Jules',
        photo: null,
        bio:
          'Jules (they/them, she/her) is a nonbinary Brazilian who is PyLadies Recife and PyLadies Brasil Co-organizer. Fullstack developer by daylight and artist by moonlight, they are always eager to support event organizers and help provide a more inclusive community at the Diversity and Inclusion Workgroup from PSF. Former board member from Python Brazil Association (APyB) from 2022 to 2026. AuDHD and STEMinist.',
      },
      {
        name: 'Débora Azevedo',
        photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/deborah.original.png',
        bio:
          'Débora is a public school teacher in Brazil, and one of the cofounders of PyLadies Brazil, the largest PyLadies chapter in the world. She’s a PhD student and she researches educational software development. She’s currently one of the organizers of Python Nordeste, a regional Python conference in Brazil, and a former PSF board member (2021–2024).',
      },
      {
        name: 'Alla Barbalat',
        photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/alla.original.png',
        bio:
          'Alla Barbalat began her career as a lawyer before transitioning into tech. She is the lead organizer of PyLadies San Francisco, an avid Python user, and a speaker on topics at the intersection of Python, AI, and law.',
      },
      {
        name: 'Georgi Ker',
        photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/georgi.original.jpg',
        bio:
          'Georgi Ker is the Director and a Fellow of the Python Software Foundation. She co-organizes PyLadiesCon and chairs the D&I Workgroup within the PSF. She is also one of the co-hosts of the podcast series "The Hidden Figures of Python" alongside Mariatta Wijaya, Cheuk Ting Ho, and Tereza Iofciu.',
      },
      {
        name: 'Theresa Seyram Agbenyegah (Stancy)',
        photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/Stancy-Portrait.original.jpg',
        bio:
          'Theresa Seyram Agbenyegah (mostly referred to in the Tech community as Stancy) is a Software Engineer, Open-Source advocate, and Social Entrepreneur. She currently serves as the Programmes and Events Lead for PyLadies Ghana and is a member of Python Ghana. She is a DSF member and a member of the DSF event support working group, a PSF Diversity and Inclusion workgroup member, an Outreach ambassador for the CHAOSS DEI workgroup, and a Django Girls organizer.',
      },
      {
        name: 'Abhijeet Mote',
        photo: 'https://pycon-assets.s3.amazonaws.com/2026/media/images/MNTN_Matt-Lief-Anderson_2856-Edit.original.jpg',
        bio:
          'Abhijeet is a Lead Python AI Engineer and Fellow of the Python Software Foundation. He founded Python Penang, Malaysia, where he has helped grow the local developer community. He has spoken at international conferences including PyCon Italy, runs workshops, and mentors students and underrepresented groups in technology. His work focuses on scalable Python AI systems, distributed systems, data pipelines, and LLM-based applications across adtech, semiconductor, and healthcare.',
      },
    ],
  };

  // Fallback avatar for panelists without an uploaded photo. Reuses the
  // global default so the placeholder matches the rest of the app.
  panelistFallback = 'assets/img/person-circle-outline.png';

  constructor(
    public liveUpdateService: LiveUpdateService,
    private confData: ConferenceData,
  ) {}

  ngOnInit() {
    this.confData.load().subscribe((data: any) => {
      if (data?.sessions) {
        const keynoteSessions = data.sessions.filter(
          (s: any) => s.track === 'Keynote' || s.tracks?.includes('keynote')
        );
        this.speakers.forEach(speaker => {
          const match = keynoteSessions.find(
            (s: any) => s.name?.toLowerCase().includes(speaker.name.toLowerCase())
          );
          if (match) {
            speaker.session = match;
          }
        });

        // The D&I Panel ships as a kind="plenary" slot named
        // "Diversity & Inclusion Panel" — not as a keynote — so look it
        // up across all sessions, not just `keynoteSessions` above.
        this.diversityPanel.session = data.sessions.find(
          (s: any) =>
            typeof s.name === 'string' &&
            /diversity\s*(?:&|and)\s*inclusion\s+panel/i.test(s.name),
        );
        // Steering Council session link. The schedule slot is literally
        // titled "Steering Council Panel" (after track-prefix stripping),
        // not "Python Steering Council" — match flexibly so future title
        // tweaks don't break the link.
        this.steeringCouncil.session = data.sessions.find(
          (s: any) =>
            typeof s.name === 'string' &&
            /steering\s+council/i.test(s.name),
        );
      }
    });
  }

  onScroll(event: any) {
    this.showTitle = event.detail.scrollTop > 100;
  }
}
