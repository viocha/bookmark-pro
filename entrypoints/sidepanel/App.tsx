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

  // ── Cross-extension: consume pending LOCATE_BOOKMARK requests ──
  useEffect(() => {
    // Check session storage for a locate request written by the background script
    // (handles the case where the sidepanel was not yet open when the request arrived)
    chrome.storage.session
      .get('locateRequest')
      .then((data: Record<string, { nodeId: string; ts: number } | undefined>) => {
        const req = data.locateRequest;
        if (req?.nodeId && Date.now() - req.ts < 30_000) {
          chrome.storage.session.remove('locateRequest').catch(() => {});
          // Small delay so the tree has time to fully render
          setTimeout(() => {
            useBookmarkStore.getState().locateNode(req.nodeId);
          }, 350);
        }
      })
      .catch(() => {});

    // Also listen for real-time messages forwarded by the background script
    // (handles the case where the sidepanel was already open)
    const handleMessage = (message: unknown) => {
      if (
        message !== null &&
        typeof message === 'object' &&
        (message as Record<string, unknown>).type === 'LOCATE_BOOKMARK' &&
        typeof (message as Record<string, unknown>).nodeId === 'string'
      ) {
        useBookmarkStore
          .getState()
          .locateNode((message as Record<string, unknown>).nodeId as string);
        return true;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

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
