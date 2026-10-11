import type { KeyboardEventHandler, RefObject } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { ScrollableTextarea } from '@/components/ScrollableTextarea';

export function BookmarkFormFields({
  idPrefix,
  title,
  url,
  onTitleChange,
  onUrlChange,
  titleRef,
  urlRef,
  onKeyDown,
}: {
  idPrefix: string;
  title: string;
  url: string;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  titleRef?: RefObject<HTMLTextAreaElement | null>;
  urlRef?: RefObject<HTMLTextAreaElement | null>;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-title`}>名称</FieldLabel>
        <ScrollableTextarea
          id={`${idPrefix}-title`}
          ref={titleRef}
          rows={2}
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-url`}>网址</FieldLabel>
        <ScrollableTextarea
          id={`${idPrefix}-url`}
          ref={urlRef}
          rows={3}
          className="break-all"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          value={url}
          onChange={e => onUrlChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </Field>
    </>
  );
}
