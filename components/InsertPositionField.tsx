import { useId } from 'react';
import type { InsertPosition } from '@/hooks/useSettings';
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
    <FieldSet>
      <FieldLegend variant="label" id={`${id}-label`}>
        {label}
      </FieldLegend>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={value}
        onValueChange={(next) => {
          if (next === 'top' || next === 'bottom') onChange(next);
        }}
        className="flex gap-6"
      >
        <Field orientation="horizontal">
          <RadioGroupItem id={`${id}-top`} value="top" />
          <FieldLabel htmlFor={`${id}-top`}>顶部</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem id={`${id}-bottom`} value="bottom" />
          <FieldLabel htmlFor={`${id}-bottom`}>底部</FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  );
}
