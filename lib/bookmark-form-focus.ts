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

/** 从开头显示文本；仅在明确需要替换默认名称的新建流程中全选。 */
export function focusBookmarkTitle(
  title: HTMLTextAreaElement | null,
  url: HTMLTextAreaElement | null,
  { selectTitle = false }: { selectTitle?: boolean } = {},
) {
  if (title) {
    title.focus({ preventScroll: true });
    title.setSelectionRange(0, selectTitle ? title.value.length : 0, 'backward');
    resetScroll(title);
  }
  if (url) {
    url.setSelectionRange(0, 0);
    resetScroll(url);
  }
  return title;
}
