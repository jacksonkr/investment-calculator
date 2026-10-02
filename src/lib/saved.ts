import { Preferences } from "@capacitor/preferences";

export type SavedScenario = {
  id: string;
  name: string;
  /** The scenario in the same compact form as the shareable link's hash. */
  hash: string;
};

const KEY = "saved-scenarios";

// Stored on the device (browser storage on the web). Storage can be missing,
// for example in a private window, in which case nothing is saved.
export async function loadSaved(): Promise<SavedScenario[]> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value ? (JSON.parse(value) as SavedScenario[]) : [];
  } catch {
    return [];
  }
}

export async function storeSaved(list: SavedScenario[]) {
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(list) });
  } catch {
    // Nothing to do; the list still works until the app is closed.
  }
}
