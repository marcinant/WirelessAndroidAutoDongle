import type { SavedDongle } from './onboarding/store';

export type RootStackParamList = {
  Onboarding: undefined;
  Dashboard: { dongle: SavedDongle };
  Config: { dongle: SavedDongle };
  Logs: { dongle: SavedDongle };
};
