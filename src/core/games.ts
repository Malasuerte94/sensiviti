import { builtInGameIds, type CustomGame, type GameId, type Setup } from './types';
export interface GameProfile {
  id: string;
  scale: GameId | 'linear';
  name: string;
  shortName: string;
  category: string;
  min: number;
  max: number;
  decimals: number;
  color: string;
  toAngular(sensitivity: number): number;
  fromAngular(angular: number): number;
  instruction: string;
  source: string;
  note?: string;
}
const catalogSource =
  'https://github.com/swiiftex/Source2AllSensitivityConverter/blob/main/Services/GameCatalog.cs';
function linearProfile(
  id: GameId,
  name: string,
  shortName: string,
  category: string,
  yaw: number,
  min: number,
  max: number,
  decimals: number,
  color: string,
  instruction: string,
): GameProfile {
  return {
    id,
    scale: id,
    name,
    shortName,
    category,
    min,
    max,
    decimals,
    color,
    instruction,
    toAngular: (s) => yaw * s,
    fromAngular: (a) => a / yaw,
    source: catalogSource,
  };
}
export const games: Record<GameId, GameProfile> = {
  cs2: {
    id: 'cs2',
    scale: 'cs2',
    name: 'Counter-Strike 2',
    shortName: 'CS2',
    category: 'TACTICAL FPS',
    min: 0.0001,
    max: 8,
    decimals: 4,
    color: '#eeb85b',
    toAngular: (s) => 0.022 * s,
    fromAngular: (a) => a / 0.022,
    instruction:
      'Settings → Keyboard / Mouse → Mouse Sensitivity. For exact input, use the console command below. Assumes default m_yaw 0.022.',
    source:
      'https://github.com/ValveSoftware/source-sdk-2013/blob/master/src/game/client/in_mouse.cpp',
  },
  apex: {
    id: 'apex',
    scale: 'apex',
    name: 'Apex Legends',
    shortName: 'APEX',
    category: 'BATTLE ROYALE',
    min: 0.01,
    max: 20,
    decimals: 4,
    color: '#ef837d',
    toAngular: (s) => 0.022 * s,
    fromAngular: (a) => a / 0.022,
    instruction:
      'Settings → Mouse/Keyboard → Mouse Sensitivity. Match your DPI and leave acceleration disabled. Hipfire conversion uses the standard 0.022 angular scale.',
    source: 'https://gist.github.com/CasualX/197e6dcffa9a9f28fee9ff50012d9e11',
  },
  minecraft: {
    id: 'minecraft',
    scale: 'minecraft',
    name: 'Minecraft Java',
    shortName: 'MC',
    category: 'JAVA EDITION',
    min: 0,
    max: 1,
    decimals: 8,
    color: '#87c895',
    toAngular: (s) => 1.2 * (0.6 * s + 0.2) ** 3,
    fromAngular: (a) => (Math.cbrt(a / 1.2) - 0.2) / 0.6,
    instruction:
      'Options → Controls → Mouse Settings → Sensitivity (0–200%). For precision, close Minecraft and set mouseSensitivity in options.txt. Assumes vanilla mouse input; mods can change this curve.',
    source: 'https://modrinth.com/mod/tweak-mouse-sensitivity',
  },
  battlefield6: {
    ...linearProfile(
      'battlefield6',
      'Battlefield 6',
      'BF6',
      'MILITARY FPS',
      0.00173624,
      0,
      200,
      1,
      '#dba16b',
      'Mouse & Keyboard → Control Settings → Infantry mouse sensitivity. Use the infantry slider, with raw input and acceleration disabled.',
    ),
    toAngular: (s) => 0.00173624 * (s + 4 / 3),
    fromAngular: (a) => a / 0.00173624 - 4 / 3,
    note: 'Approximate community-measured infantry scale. Verify with a full turn in the firing range; ADS and vehicles use separate settings.',
  },
  pubg: {
    ...linearProfile(
      'pubg',
      'PUBG: BATTLEGROUNDS',
      'PUBG',
      'BATTLE ROYALE',
      1,
      0,
      100,
      0,
      '#e8bf61',
      'Settings → Controls → Mouse → General Sensitivity. This profile is for first-person hipfire at in-game FOV 90. Keep scope and vertical multipliers separate.',
    ),
    toAngular: (s) => 0.002 * 10 ** (s / 50) * 2.49975,
    fromAngular: (a) => 50 * Math.log10(a / (0.002 * 2.49975)),
    note: 'Approximate community-measured scale for FPP at FOV 90. Other FOVs and third-person use a different turn distance.',
  },
  modernwarfare: linearProfile(
    'modernwarfare',
    'Call of Duty: Modern Warfare (2019)',
    'MW',
    'MILITARY FPS',
    0.0066,
    0.01,
    100,
    2,
    '#96b9a5',
    'Options → Keyboard & Mouse → Mouse Sensitivity. Applies to Modern Warfare (2019) hipfire with mouse acceleration and filtering disabled.',
  ),
  warzone: linearProfile(
    'warzone',
    'Call of Duty: Warzone',
    'WZ',
    'BATTLE ROYALE',
    0.0066,
    0.01,
    100,
    2,
    '#a0bf8e',
    'Settings → Keyboard & Mouse → Mouse Sensitivity. Use the hipfire value; ADS multipliers and monitor-distance settings are separate.',
  ),
  valorant: linearProfile(
    'valorant',
    'VALORANT',
    'VAL',
    'TACTICAL FPS',
    0.07,
    0.001,
    100,
    3,
    '#f48791',
    'Settings → General → Mouse → Sensitivity: Aim. Scoped and ADS sensitivity multipliers are separate.',
  ),
  overwatch2: linearProfile(
    'overwatch2',
    'Overwatch 2',
    'OW2',
    'HERO SHOOTER',
    0.0066,
    0.01,
    100,
    2,
    '#efb064',
    'Options → Controls → Mouse → Sensitivity. Check individual hero overrides; scoped relative sensitivity is separate.',
  ),
  fortnite: linearProfile(
    'fortnite',
    'Fortnite',
    'FN',
    'BATTLE ROYALE',
    0.005555,
    0.1,
    100,
    1,
    '#b09af1',
    'Settings → Mouse and Keyboard → X-Axis Sensitivity / Y-Axis Sensitivity. Enter the displayed percentage on both axes. Targeting and scope multipliers are separate.',
  ),
  siege: linearProfile(
    'siege',
    'Rainbow Six Siege',
    'R6',
    'TACTICAL FPS',
    0.00572958,
    1,
    100,
    0,
    '#8cb5e3',
    'Options → Controls → Mouse Sensitivity Horizontal / Vertical. Assumes the default MouseSensitivityMultiplierUnit of 0.02. ADS uses separate settings.',
  ),
  destiny2: linearProfile(
    'destiny2',
    'Destiny 2',
    'D2',
    'LOOTER SHOOTER',
    0.0066,
    1,
    100,
    0,
    '#a9b8e1',
    'Settings → Mouse & Keyboard → Look Sensitivity. The whole-number slider can only approximate some turn distances. ADS modifier is separate.',
  ),
  thefinals: linearProfile(
    'thefinals',
    'THE FINALS',
    'FIN',
    'ARENA SHOOTER',
    0.001,
    1,
    100,
    0,
    '#ed8797',
    'Settings → Mouse & Keyboard → Mouse Look Sensitivity. Keep mouse focal-length sensitivity scaling disabled when checking hipfire turn distance.',
  ),
};
export const gameIds: GameId[] = [...builtInGameIds];
export function customGameProfile(custom: CustomGame): GameProfile {
  if (custom.scale !== 'linear') {
    const base = games[custom.scale];
    return {
      ...base,
      id: custom.id,
      name: custom.name,
      instruction: `Uses the ${base.name} sensitivity scale. ${base.instruction}`,
    };
  }
  const yaw = custom.yaw!;
  return {
    id: custom.id,
    scale: 'linear',
    name: custom.name,
    shortName: 'CUSTOM',
    category: 'CUSTOM GAME',
    min: 0.000001,
    max: 100000,
    decimals: 6,
    color: '#89d5c5',
    toAngular: (s) => yaw * s,
    fromAngular: (a) => a / yaw,
    instruction:
      'Based on your measured hipfire turn distance. Keep acceleration, FOV, and input settings the same as when measuring.',
    source: '',
    note: 'Measured conversion assumes sensitivity scales linearly. Recheck the turn distance after changing the setting.',
  };
}
export const defaultSetup: Setup = {
  dpi: 800,
  game: 'cs2',
  sensitivity: 1,
  hipFov: 90,
  adsFov: 55,
  adsMultiplier: 0.5,
};
export function cm360(angular: number, dpi: number): number {
  return 914.4 / (dpi * angular);
}
export function angularFromCm(cm: number, dpi: number): number {
  return 914.4 / (cm * dpi);
}
export function convert(angular: number, dpi: number, id: GameId) {
  return convertProfile(angular, dpi, games[id]);
}
export function convertProfile(angular: number, dpi: number, game: GameProfile) {
  const exact = game.fromAngular(angular);
  const reachable = exact >= game.min - 1e-10 && exact <= game.max + 1e-10;
  const value = Math.min(game.max, Math.max(game.min, exact));
  const rounded = Number(value.toFixed(game.decimals));
  const actualCm = cm360(game.toAngular(rounded), dpi);
  const requestedCm = cm360(angular, dpi);
  return {
    exact,
    value,
    rounded,
    reachable,
    actualCm,
    differenceCm: actualCm - requestedCm,
    display:
      game.scale === 'minecraft'
        ? `${(value * 200).toFixed(1)}%`
        : String(rounded) + (game.scale === 'fortnite' ? '%' : ''),
    command:
      game.scale === 'cs2'
        ? `sensitivity ${rounded}`
        : game.scale === 'minecraft'
          ? `mouseSensitivity:${rounded}`
          : String(rounded),
  };
}
export function displayAngular(angular: number, game: GameId): string {
  return convert(angular, 800, game).display;
}
