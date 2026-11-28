import type { Profile } from '../types';

export interface DemoFamily {
  id: 'sharma' | 'iyer' | 'das';
  name: string;
  city: string;
  // The exact "City, State" chip label, so a place with look-alikes (Delhi) resolves without a question.
  placeLabel: string;
  // The answer to "which part of the city?", so the demo shows the area flow too.
  area: string;
  profile: Omit<Profile, 'location'>;
  // User messages played after the profile is set; each has a "?" so it is read as a question, not a place.
  script: string[];
}

const adult = { group: 'adult', respiratory: false, pregnant: false } as const;
const elder = { group: 'elderly', respiratory: false, pregnant: false } as const;

export const DEMO_FAMILIES: DemoFamily[] = [
  {
    id: 'sharma',
    name: 'Sharma',
    city: 'Delhi',
    placeLabel: 'Delhi, National Capital Territory of Delhi',
    area: 'Rohini',
    profile: {
      household: [
        adult,
        adult,
        { group: 'child', age: 8, respiratory: false, pregnant: false },
        { group: 'elderly', respiratory: true, pregnant: false },
      ],
      activities: [
        {
          kind: 'schoolRun',
          startHour: 8,
          mode: 'petrolCar',
          participants: [0, 2],
          flexible: false,
        },
        {
          kind: 'commute',
          startHour: 9,
          mode: 'petrolCar',
          distanceKm: 12,
          participants: [1],
          flexible: false,
        },
      ],
    },
    script: ['What does today look like for my family?', 'Which swap would help us the most?'],
  },
  {
    id: 'iyer',
    name: 'Iyer',
    city: 'Mumbai',
    placeLabel: 'Mumbai, Maharashtra',
    area: 'Andheri',
    profile: {
      household: [adult, adult],
      activities: [
        {
          kind: 'commute',
          startHour: 9,
          mode: 'twoWheeler',
          distanceKm: 10,
          participants: [0],
          flexible: false,
        },
        { kind: 'exercise', label: 'jog', startHour: 18, participants: [0, 1], flexible: true },
      ],
    },
    script: ['What does today look like for us?', 'When is the best time for our evening jog?'],
  },
  {
    id: 'das',
    name: 'Das',
    city: 'Kolkata',
    placeLabel: 'Kolkata, West Bengal',
    area: 'Salt Lake',
    profile: {
      household: [elder, elder],
      activities: [
        { kind: 'walk', startHour: 6, participants: [0, 1], flexible: true },
        {
          kind: 'errand',
          startHour: 10,
          mode: 'bus',
          distanceKm: 3,
          participants: [0],
          flexible: false,
        },
      ],
    },
    script: ['What does today look like for us?', 'When should we go for our morning walk?'],
  },
];
