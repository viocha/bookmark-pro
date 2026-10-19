import { useId } from 'react';
import type { InsertPosition } from '@/hooks/useSettings';
import { Field, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function InsertPositionField({
  label = '插入位置',
  value,
  onChange,
}: {
  label?: string;
  value: InsertPosition;
  onChange: (value: InsertPosition) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel id={id}>{label}</FieldLabel>
      <ToggleGroup
        aria-labelledby={id}
        variant="outline"
        size="sm"
        spacing={0}
        className="w-full"
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          if (next === 'top' || next === 'bottom') onChange(next);
        }}
      >
        <ToggleGroupItem className="flex-1" value="top">顶部</ToggleGroupItem>
        <ToggleGroupItem className="flex-1" value="bottom">底部</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}
