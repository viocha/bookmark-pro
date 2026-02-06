import { create } from 'zustand';

export type InsertPosition = 'top' | 'bottom';

interface Settings {
  folderInsertPosition: InsertPosition;
  bookmarkInsertPosition: InsertPosition;
  expandedIds: string[];
  scrollTop: number;
}

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  setFolderInsertPosition: (pos: InsertPosition) => void;
  setBookmarkInsertPosition: (pos: InsertPosition) => void;
  saveTreeState: (expandedIds: Set<string>, scrollTop: number) => void;
}

const STORAGE_KEY = 'bookmark-pro-settings';

const defaults: Settings = {
  folderInsertPosition: 'bottom',
  bookmarkInsertPosition: 'bottom',
  expandedIds: ['1'],
  scrollTop: 0,
};

export const useSettings = create<SettingsState>((set, get) => ({
  ...defaults,
  loaded: false,

  load: async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const saved = result[STORAGE_KEY] as Partial<Settings> | undefined;
      if (saved) {
        set({
          folderInsertPosition: saved.folderInsertPosition ?? defaults.folderInsertPosition,
          bookmarkInsertPosition: saved.bookmarkInsertPosition ?? defaults.bookmarkInsertPosition,
          expandedIds: saved.expandedIds ?? defaults.expandedIds,
          scrollTop: saved.scrollTop ?? defaults.scrollTop,
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  setFolderInsertPosition: (pos) => {
    set({ folderInsertPosition: pos });
    persist(get());
  },

  setBookmarkInsertPosition: (pos) => {
    set({ bookmarkInsertPosition: pos });
    persist(get());
  },

  saveTreeState: (expandedIdsSet, scrollTop) => {
    set({ expandedIds: Array.from(expandedIdsSet), scrollTop });
    persist(get());
  },
}));

function persist(state: SettingsState) {
  const data: Settings = {
    folderInsertPosition: state.folderInsertPosition,
    bookmarkInsertPosition: state.bookmarkInsertPosition,
    expandedIds: state.expandedIds,
    scrollTop: state.scrollTop,
  };
  chrome.storage.local.set({ [STORAGE_KEY]: data });
}
