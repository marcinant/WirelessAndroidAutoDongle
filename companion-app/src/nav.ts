import type { SavedDongle } from './onboarding/store';

export type RootStackParamList = {
  Devices: undefined;
  Onboarding: { mode?: 'add' } | undefined;
  Dashboard: { dongle: SavedDongle };
  Config: { dongle: SavedDongle };
  Logs: { dongle: SavedDongle };
};
