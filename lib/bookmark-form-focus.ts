function resetScroll(input: HTMLTextAreaElement) {
  input.scrollTop = 0;
  input.scrollLeft = 0;
  const viewport = input.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  if (viewport) {
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  }
}

export function resetBookmarkFields(
  title: HTMLTextAreaElement | null,
  url: HTMLTextAreaElement | null,
) {
  for (const input of [title, url]) {
    if (!input) continue;
    input.setSelectionRange(0, 0);
    resetScroll(input);
  }
}

/** 聚焦名称并将光标和滚动位置保持在文本开头。 */
export function focusBookmarkTitle(
  title: HTMLTextAreaElement | null,
  url: HTMLTextAreaElement | null,
) {
  if (title) {
    title.focus({ preventScroll: true });
    title.setSelectionRange(0, 0);
    resetScroll(title);
  }
  if (url) {
    url.setSelectionRange(0, 0);
    resetScroll(url);
  }
  return title;
}
