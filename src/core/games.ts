import type { GameId, Setup } from './types';
export interface GameProfile {
  id: GameId;
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
}
export const games: Record<GameId, GameProfile> = {
  cs2: {
    id: 'cs2',
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
};
export const gameIds: GameId[] = ['cs2', 'apex', 'minecraft'];
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
  const game = games[id];
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
      id === 'minecraft'
        ? `${(value * 200).toFixed(1)}%`
        : rounded.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''),
    command:
      id === 'cs2'
        ? `sensitivity ${rounded}`
        : id === 'minecraft'
          ? `mouseSensitivity:${rounded}`
          : String(rounded),
  };
}
export function displayAngular(angular: number, game: GameId): string {
  return convert(angular, 800, game).display;
}
