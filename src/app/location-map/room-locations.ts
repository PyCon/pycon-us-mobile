import { VenueLocation } from './venue-locations';

const CONCOURSE_THUMB = 'assets/img/floor-plans/floor-plan-1-thumb.jpg';
const CONCOURSE_FULL = 'assets/img/floor-plans/floor-plan-1.jpg';
const CONCOURSE_TITLE = 'Concourse Level';

const UPPER_THUMB = 'assets/img/floor-plans/floor-plan-2-thumb.jpg';
const UPPER_FULL = 'assets/img/floor-plans/floor-plan-2.jpg';
const UPPER_TITLE = 'Upper Level';

const ARENA_THUMB = 'assets/img/floor-plans/floor-plan-3-thumb.jpg';
const ARENA_FULL = 'assets/img/floor-plans/floor-plan-3.jpg';
const ARENA_TITLE = 'Arena & Exhibit Halls';

const SEASIDE_THUMB = 'assets/img/floor-plans/floor-plan-4-thumb.jpg';
const SEASIDE_FULL = 'assets/img/floor-plans/floor-plan-4.jpg';
const SEASIDE_TITLE = 'Seaside Meeting Rooms';

interface RoomLocation extends Omit<VenueLocation, 'sublabel'> {
  sublabel?: string;
}

function concourse(label: string, x: number, y: number, sublabel?: string): RoomLocation {
  return {
    key: label,
    label,
    sublabel,
    floorTitle: CONCOURSE_TITLE,
    thumbSrc: CONCOURSE_THUMB,
    fullSrc: CONCOURSE_FULL,
    pinXPct: x,
    pinYPct: y,
  };
}

function upper(label: string, x: number, y: number, sublabel?: string): RoomLocation {
  return {
    key: label,
    label,
    sublabel,
    floorTitle: UPPER_TITLE,
    thumbSrc: UPPER_THUMB,
    fullSrc: UPPER_FULL,
    pinXPct: x,
    pinYPct: y,
  };
}

function arena(label: string, x: number, y: number, sublabel?: string): RoomLocation {
  return {
    key: label,
    label,
    sublabel,
    floorTitle: ARENA_TITLE,
    thumbSrc: ARENA_THUMB,
    fullSrc: ARENA_FULL,
    pinXPct: x,
    pinYPct: y,
  };
}

function seaside(label: string, x: number, y: number, sublabel?: string): RoomLocation {
  return {
    key: label,
    label,
    sublabel,
    floorTitle: SEASIDE_TITLE,
    thumbSrc: SEASIDE_THUMB,
    fullSrc: SEASIDE_FULL,
    pinXPct: x,
    pinYPct: y,
  };
}

// Registry keyed by a normalized version of the room name. The canonical
// `Conference.json` ships rooms with both "Room 102A" and bare "102A" forms
// (the latter on open-space rooms), so we strip the optional "room" prefix
// and any non-alphanumerics before matching. Combined rooms (Room 103ABC,
// Room 104AB, Hall AB) get their own entry centered on the joined area.
// Coordinates derived from a 10% calibration grid drawn over each native-size
// floor plan. Bumping any of these is a one-line tweak — no code change.
const ROOM_LOCATIONS_RAW: Record<string, RoomLocation> = {
  // Concourse Level — Rooms 101–104. Coordinates computed from native-image
  // bounding boxes (see /tmp/find-rooms.py): rooms 101 and 102 sit between
  // x≈11–32%, room 103 at x≈37–48%, all centered on y≈50%. The 104 row is a
  // tilted parallelogram in the upper right.
  '101a': concourse('Room 101A', 14, 50, 'Tutorials / PSF Members Lunch / PyLadies Lunch'),
  '101b': concourse('Room 101B', 19, 50, 'Tutorials / PSF Members Lunch / PyLadies Lunch'),
  '101ab': concourse('Room 101AB', 17, 50, 'Tutorials / PSF Members Lunch / PyLadies Lunch'),
  '102a': concourse('Room 102A', 23, 50, 'Tutorials / Open Spaces'),
  '102b': concourse('Room 102B', 27, 50, 'Tutorials / Open Spaces'),
  '102c': concourse('Room 102C', 31, 50, 'Tutorials / Open Spaces'),
  '103a': concourse('Room 103A', 39, 50, 'Talk Track / Security Track'),
  '103b': concourse('Room 103B', 43, 50, 'Talk Track / Security Track'),
  '103c': concourse('Room 103C', 46, 50, 'Talk Track / Security Track'),
  '103abc': concourse('Room 103', 43, 50, 'Talk Track / Security Track'),
  '104a': concourse('Room 104A', 72, 38, 'Talk Track'),
  '104b': concourse('Room 104B', 80, 35, 'Talk Track'),
  '104c': concourse('Room 104C', 84, 27, 'Education Summit / Charlas / Open Spaces'),
  '104ab': concourse('Room 104AB', 76, 37, 'Talk Track'),
  '104abc': concourse('Room 104', 78, 33, 'Talk Track / Education Summit'),

  // Upper Level — Rooms 201–204 + Grand Ballroom. Coordinates from native-image
  // bounding boxes: the 201–203 row sits at y≈59% (NOT 50%, the floor plan
  // dedicates the upper half to empty space + label callouts).
  '201a': upper('Room 201A', 7, 59, 'Summits / Open Spaces'),
  '201b': upper('Room 201B', 14, 59, 'Sponsor Presentations / Open Spaces'),
  '202a': upper('Room 202A', 19, 59, 'Sponsor Presentations / Open Spaces'),
  '202b': upper('Room 202B', 23, 59, 'Sponsor Presentations / Open Spaces'),
  '202c': upper('Room 202C', 27, 59, 'Sponsor Presentations / Open Spaces'),
  '203a': upper('Room 203A', 36, 59, 'Staff Office'),
  '203b': upper('Room 203B', 41, 59, 'Staff Office'),
  '203c': upper('Room 203C', 45, 59, 'Green Room / Speaker Ready Room'),
  '204': upper('Room 204', 60, 48, 'AV Room'),
  'grandballrooma': upper('Grand Ballroom A', 76, 36, 'AI Track / Talk Track'),
  'grandballroomb': upper('Grand Ballroom B', 84, 50, 'Talk Track'),
  'grandballroom': upper('Grand Ballroom', 80, 43, 'Talk Tracks'),

  // Arena & Exhibit Halls (this floor plan is portrait-oriented, 1700×2200)
  'pacificballroomarena': arena('Pacific Ballroom — Arena', 60, 16, 'Keynotes, Lightning Talks, General Sessions'),
  'arena': arena('Arena', 60, 16, 'Keynotes, Lightning Talks, General Sessions'),
  'halla': arena('Hall A', 18, 72, 'Exhibit Hall'),
  'hallb': arena('Hall B', 43, 63, 'Exhibit Hall'),
  'hallc': arena('Hall C', 58, 55, 'Exhibit Hall'),
  'hallab': arena('Hall AB', 32, 67, 'Expo Hall — Booths, Job Fair, Community Showcase'),
  'expohallab': arena('Expo Hall AB', 32, 67, 'Booths, Job Fair, Community Showcase'),
  'expohallc': arena('Expo Hall C', 58, 55, 'Posters, Open Spaces'),
  'expohall': arena('Expo Hall', 38, 64, 'Booths, Job Fair, Community Showcase'),

  // Seaside Meeting Rooms
  's1': seaside('S-1', 85, 63, 'Sprints'),
  's2': seaside('S-2', 53, 57, 'Sprints'),
  's3': seaside('S-3', 58, 68, 'Open Spaces / Sprints'),
  's3a': seaside('S-3A', 60, 68, 'Open Spaces / Sprints'),
  's3b': seaside('S-3B', 55, 68, 'Open Spaces / Sprints'),
  's4': seaside('S-4', 46, 68, 'Web Assembly Summit / Open Spaces / Sprints'),
  's4a': seaside('S-4A', 49, 68, 'Open Spaces / Sprints'),
  's4b': seaside('S-4B', 44, 68, 'Web Assembly Summit / Open Spaces / Sprints'),
  's5': seaside('S-5', 45, 24, 'Open Spaces / Sprints'),
  's5a': seaside('S-5A', 47, 24, 'Sprints'),
  's5b': seaside('S-5B', 43, 24, 'Open Spaces / Sprints'),
  's6': seaside('S-6', 53, 24, 'Sprints'),
  's7': seaside('S-7', 80, 27, 'Satellite Staff Office'),
  'seasidelobby': seaside('Seaside Lobby', 33, 44, 'Sprints'),
  'seasideballrooma': seaside('Seaside Ballroom A', 55, 44, 'PyLadies Auction / Sprints'),
  'seasideballroomb': seaside('Seaside Ballroom B', 44, 44, 'PyLadies Auction / Sprints'),
  'seasideballroom': seaside('Seaside Ballroom', 50, 44, 'PyLadies Auction / Sprints'),
};

function normalizeRoomKey(name: string): string {
  // Lowercase, drop the optional "Room " prefix, drop everything that isn't
  // a-z or 0-9. So "Room 102A" / "102A" / "room 102a" all collapse to "102a".
  return (name || '')
    .toLowerCase()
    .replace(/^room\s+/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function getRoomLocation(roomName: string | null | undefined): RoomLocation | null {
  if (!roomName) return null;
  const key = normalizeRoomKey(roomName);
  return ROOM_LOCATIONS_RAW[key] || null;
}

export const ROOM_LOCATIONS = ROOM_LOCATIONS_RAW;
