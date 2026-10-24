import type { MouseEventHandler } from 'react';

/** 悬停时按实际尺寸判断单行或多行截断，离开后清除原生提示。 */
export function getTruncatedTitleProps(title: string) {
  const onMouseEnter: MouseEventHandler<HTMLElement> = ({ currentTarget }) => {
    if (
      currentTarget.scrollWidth > currentTarget.clientWidth ||
      currentTarget.scrollHeight > currentTarget.clientHeight
    ) {
      currentTarget.title = title;
    } else {
      currentTarget.removeAttribute('title');
    }
  };
  const onMouseLeave: MouseEventHandler<HTMLElement> = ({ currentTarget }) => {
    currentTarget.removeAttribute('title');
  };
  return { onMouseEnter, onMouseLeave };
}
