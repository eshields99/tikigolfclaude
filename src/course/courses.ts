// Course catalogue.
import type { CourseInfo } from '../game/game';
import { coconutCove } from './holes/coconut';
import { jungleFalls } from './holes/jungle';
import { volcanoPeak } from './holes/volcano';

export const COURSES: CourseInfo[] = [
  {
    id: 'coconut',
    name: 'Coconut Cove',
    subtitle: 'Sun, sand & sweet putts',
    env: 'day',
    theme: 'beach',
    color: '#2fd6c8',
    style: { turfA: 0x63c832, turfB: 0x4caf27, stone: 0x5b5754, plinth: 0x57514d, sand: 0xf1d9a0, wood: 0xa0703f, flag: 0xe0242c },
    holes: coconutCove,
  },
  {
    id: 'jungle',
    name: 'Jungle Falls',
    subtitle: 'Waterfalls, bridges & temples',
    env: 'golden',
    theme: 'jungle',
    color: '#7dd35a',
    style: { turfA: 0x5ec235, turfB: 0x49a92a, stone: 0x5d5a52, plinth: 0x504b44, sand: 0xe8cf94, wood: 0x9a6a3a, flag: 0xe0242c },
    holes: jungleFalls,
  },
  {
    id: 'volcano',
    name: 'Volcano Peak',
    subtitle: 'Lava, ramps & the crater',
    env: 'sunset',
    theme: 'volcano',
    color: '#ff7a3a',
    style: { turfA: 0x6ccd3a, turfB: 0x55b62e, stone: 0x544c49, plinth: 0x433a37, sand: 0x7a685c, wood: 0x7a4a2a, flag: 0xe0242c },
    holes: volcanoPeak,
    backdrop: { volcano: { at: [-60, -190], height: 105, radius: 120 } },
  },
];
