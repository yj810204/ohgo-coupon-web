'use client';

import { TemplateField, TemplateFieldType } from '@/utils/community-template-service';

interface TemplateFieldInputProps {
  field: TemplateField;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
}

export default function TemplateFieldInput({ field, value, onChange, disabled = false }: TemplateFieldInputProps) {
  const fieldType = field.type || 'text';

  const handleCheckboxChange = (option: string, checked: boolean) => {
    const currentValues = Array.isArray(value) ? value : [];
    if (checked) {
      onChange([...currentValues, option]);
    } else {
      onChange(currentValues.filter(v => v !== option));
    }
  };

  switch (fieldType) {
    case 'textarea':
      return (
        <textarea
          className="form-control form-control-sm"
          rows={3}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          className="form-control form-control-sm"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        />
      );

    case 'radio':
      return (
        <div>
          {field.options?.map((option, idx) => (
            <div key={idx} className="form-check">
              <input
                className="form-check-input"
                type="radio"
                name={`radio_${field.label}`}
                id={`radio_${field.label}_${idx}`}
                value={option}
                checked={value === option}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                required={field.required}
              />
              <label className="form-check-label" htmlFor={`radio_${field.label}_${idx}`}>
                {option}
              </label>
            </div>
          ))}
        </div>
      );

    case 'checkbox':
      return (
        <div>
          {field.options?.map((option, idx) => {
            const currentValues = Array.isArray(value) ? value : [];
            return (
              <div key={idx} className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`checkbox_${field.label}_${idx}`}
                  checked={currentValues.includes(option)}
                  onChange={(e) => handleCheckboxChange(option, e.target.checked)}
                  disabled={disabled}
                />
                <label className="form-check-label" htmlFor={`checkbox_${field.label}_${idx}`}>
                  {option}
                </label>
              </div>
            );
          })}
        </div>
      );

    default: // text
      return (
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        />
      );
  }
}

