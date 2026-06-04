export type TemplateFieldType = 'text' | 'textarea' | 'radio' | 'checkbox' | 'date';

export interface TemplateField {
  label: string;
  placeholder: string;
  required?: boolean;
  type?: TemplateFieldType;
  options?: string[];
  order?: number;
}

export interface CommunityTemplate {
  templateId: string;
  name: string;
  fields: TemplateField[];
  createdAt: Date | string;
}

export function applyTemplate(
  template: CommunityTemplate,
  values: Record<string, string | string[]>,
): string {
  try {
    let html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0;">';
    html += '<tbody>';

    const sortedFields = [...template.fields].sort((a, b) => {
      const orderA = a.order ?? template.fields.indexOf(a);
      const orderB = b.order ?? template.fields.indexOf(b);
      return orderA - orderB;
    });

    sortedFields.forEach((field) => {
      const fieldType = field.type || 'text';
      const rawValue = values[field.label];
      let displayValue = '';

      if (fieldType === 'checkbox' && Array.isArray(rawValue)) {
        displayValue = rawValue.length > 0 ? rawValue.join(', ') : '';
      } else if (fieldType === 'radio' || fieldType === 'checkbox') {
        displayValue = Array.isArray(rawValue) ? rawValue.join(', ') : ((rawValue as string) || '');
      } else {
        displayValue = (rawValue as string) || '';
      }

      if (displayValue || field.required) {
        html += '<tr>';
        html += `<td style="border: 1px solid #ddd; padding: 8px; background-color: #f8f9fa; font-weight: bold; width: 30%;">${field.label}</td>`;
        html += `<td style="border: 1px solid #ddd; padding: 8px; width: 70%;">${displayValue || field.placeholder || ''}</td>`;
        html += '</tr>';
      }
    });

    html += '</tbody></table>';
    return html;
  } catch (error) {
    console.error('Error applying template:', error);
    return '';
  }
}
