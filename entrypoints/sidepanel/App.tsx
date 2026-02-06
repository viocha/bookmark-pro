import { useEffect } from 'react';
import { useBookmarkStore, setupBookmarkListeners } from '@/hooks/useBookmarkStore';
import { useSettings } from '@/hooks/useSettings';
import { Header } from '@/components/Header';
import { BookmarkTree } from '@/components/bookmark-tree/BookmarkTree';
import { SearchResults } from '@/components/SearchResults';
import { EditDialog } from '@/components/EditDialog';
import { CreateFolderDialog } from '@/components/CreateFolderDialog';
import { AddBookmarkDialog } from '@/components/AddBookmarkDialog';
import { MoveDialog } from '@/components/MoveDialog';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  const { loadTree, searchResults } = useBookmarkStore();

  useEffect(() => {
    const init = async () => {
      await useSettings.getState().load();
      const { expandedIds } = useSettings.getState();
      useBookmarkStore.getState().restoreExpandedIds(expandedIds);
      await loadTree();
    };
    init();
    setupBookmarkListeners();
  }, [loadTree]);

  return (
    <div className="flex flex-col h-screen w-full">
      <Header />
      <div className="flex-1 overflow-hidden">
        {searchResults ? <SearchResults /> : <BookmarkTree />}
      </div>
      <EditDialog />
      <CreateFolderDialog />
      <AddBookmarkDialog />
      <MoveDialog />
      <Toaster />
    </div>
  );
}
