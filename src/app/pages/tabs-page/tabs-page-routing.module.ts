import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs-page';
import { SchedulePage } from '../schedule/schedule';
import { ScheduleListPageModule } from '../schedule-list/schedule-list.module';


const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'schedule',
        children: [
          {
            path: '',
            component: SchedulePage,
          },
          {
            path: 'session/:sessionId',
            loadChildren: () => import('../session-detail/session-detail.module').then(m => m.SessionDetailModule)
          }
        ]
      },
      {
        path: 'tracks',
        children: [
          {
            path: ':trackSlug',
            loadChildren: () => import('../schedule-list/schedule-list.module').then(m => m.ScheduleListPageModule)
          },
        ]
      },
      {
        path: 'speakers',
        children: [
          {
            path: '',
            loadChildren: () => import('../speaker-list/speaker-list.module').then(m => m.SpeakerListModule)
          },
          {
            path: 'session/:sessionId',
            loadChildren: () => import('../session-detail/session-detail.module').then(m => m.SessionDetailModule)
          },
          {
            path: 'speaker-details/:speakerId',
            loadChildren: () => import('../speaker-detail/speaker-detail.module').then(m => m.SpeakerDetailModule)
          }
        ]
      },
      {
        path: 'sponsors',
        children: [
          {
            path: '',
            loadChildren: () => import('../sponsors/sponsors.module').then(m => m.SponsorsPageModule)
          },
          {
            path: 'sponsor-detail/:sponsorId',
            loadChildren: () => import('../sponsor-detail/sponsor-detail.module').then(m => m.SponsorDetailModule)
          }
        ]
      },
      {
        path: 'expo-hall',
        loadChildren: () => import('../conference-map/conference-map.module').then( m => m.ConferenceMapPageModule),
        data: { initialView: 'expo-hall', pageTitle: 'Expo Hall' }
      },
      {
        path: 'conference-map',
        loadChildren: () => import('../conference-map/conference-map.module').then( m => m.ConferenceMapPageModule)
      },
      {
        path: 'lead-retrieval',
        children: [
          {
            path: '',
            loadChildren: () => import('../map/map.module').then(m => m.MapModule)
          }
        ]
      },
      {
        path: 'door-check',
        children: [
          {
            path: '',
            loadChildren: () => import('../door-check/door-check.module').then(m => m.DoorCheckPageModule)
          }
        ]
      },
      {
        path: 't-shirt-redemption',
        children: [
          {
            path: '',
            loadChildren: () => import('../t-shirt-redemption/t-shirt-redemption.module').then(m => m.TShirtRedemptionPageModule)
          }
        ]
      },
      {
        path: 'mask-violation',
        children: [
          {
            path: '',
            loadChildren: () => import('../mask-violation/mask-violation.module').then(m => m.MaskViolationPageModule)
          }
        ]
      },
      {
        path: 'coc',
        children: [
          {
            path: '',
            loadChildren: () => import('../coc/coc.module').then(m => m.CocPageModule)
          }
        ]
      },
      {
        path: 'wifi',
        children: [
          {
            path: '',
            loadChildren: () => import('../wifi/wifi.module').then(m => m.WifiPageModule)
          }
        ]
      },
      {
        path: 'notifications',
        children: [
          {
            path: '',
            loadChildren: () =>
              import('../notification-settings/notification-settings.module').then(
                m => m.NotificationSettingsPageModule,
              ),
          },
        ],
      },
      {
        path: 'rooms',
        children: [
          {
            path: '',
            loadChildren: () => import('../rooms/rooms.module').then(m => m.RoomsPageModule)
          },
          {
            path: 'room-detail/:roomSlug',
            loadChildren: () => import('../room-detail/room-detail.module').then(m => m.RoomDetailPageModule)
          },
          {
            path: 'session/:sessionId',
            loadChildren: () => import('../session-detail/session-detail.module').then(m => m.SessionDetailModule)
          }
        ]
      },
      {
        path: 'venues-hours',
        children: [
          {
            path: '',
            loadChildren: () => import('../venues-hours/venues-hours.module').then(m => m.VenuesHoursPageModule)
          }
        ]
      },
      {
        path: 'lightning-talks',
        children: [
          {
            path: '',
            loadChildren: () => import('../lightning-talks/lightning-talks.module').then(m => m.LightningTalksPageModule)
          }
        ]
      },
      {
        path: 'session-types',
        children: [
          {
            path: '',
            loadChildren: () => import('../session-types/session-types.module').then(m => m.SessionTypesPageModule)
          }
        ]
      },
      {
        path: 'about-pycon',
        children: [
          {
            path: '',
            loadChildren: () => import('../about-pycon/about-pycon.module').then(m => m.AboutPyconPageModule)
          }
        ]
      },
      {
        path: 'about-psf',
        children: [
          {
            path: '',
            loadChildren: () => import('../about-psf/about-psf.module').then(m => m.AboutPsfPageModule)
          }
        ]
      },
      {
        path: 'social-media',
        children: [
          {
            path: '',
            loadChildren: () => import('../social-media/social-media.module').then(m => m.SocialMediaPageModule)
          }
        ]
      },
      {
        path: 'sprints',
        children: [
          {
            path: '',
            loadChildren: () => import('../sprints/sprints.module').then(m => m.SprintsPageModule)
          }
        ]
      },
      {
        path: 'keynote-speakers',
        children: [
          {
            path: '',
            loadChildren: () => import('../keynote-speakers/keynote-speakers.module').then(m => m.KeynoteSpeakersPageModule)
          }
        ]
      },
      {
        path: 'job-listings',
        children: [
          {
            path: '',
            loadChildren: () => import('../job-listings/job-listings.module').then(m => m.JobListingsPageModule)
          }
        ]
      },
      {
        path: 'now',
        loadChildren: () => import('../now/now.module').then(m => m.NowPageModule)
      },
      {
        path: 'help',
        children: [
          {
            path: '',
            loadChildren: () => import('../help/help.module').then(m => m.HelpPageModule)
          }
        ]
      },
      {
        path: 'account',
        loadChildren: () => import('../account/account.module').then(m => m.AccountModule)
      },
      {
        path: 'login',
        loadChildren: () => import('../login/login.module').then(m => m.LoginModule)
      },
      {
        path: 'dev-tools',
        children: [
          {
            path: '',
            loadChildren: () => import('../dev-tools/dev-tools.module').then(m => m.DevToolsPageModule)
          }
        ]
      },
      {
        path: '',
        redirectTo: '/app/tabs/schedule',
        pathMatch: 'full'
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsPageRoutingModule { }

