import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type TemplateFieldType = 'text' | 'textarea' | 'radio' | 'checkbox' | 'date';

export interface TemplateField {
  label: string;
  placeholder: string;
  required?: boolean;
  type?: TemplateFieldType;
  options?: string[]; // radio, checkbox용 옵션 목록
  order?: number; // 필드 순서
}

export interface CommunityTemplate {
  templateId: string;
  name: string;
  fields: TemplateField[];
  createdAt: Timestamp | Date;
}

/**
 * 템플릿 목록 조회
 */
export async function getTemplates(): Promise<CommunityTemplate[]> {
  try {
    const templatesRef = collection(db, 'communityTemplates');
    const q = query(templatesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      templateId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
    })) as CommunityTemplate[];
  } catch (error) {
    console.error('Error getting templates:', error);
    throw error;
  }
}

/**
 * 특정 템플릿 조회
 */
export async function getTemplate(templateId: string): Promise<CommunityTemplate | null> {
  try {
    const templateRef = doc(db, 'communityTemplates', templateId);
    const templateSnap = await getDoc(templateRef);
    
    if (!templateSnap.exists()) {
      return null;
    }
    
    return {
      templateId: templateSnap.id,
      ...templateSnap.data(),
      createdAt: templateSnap.data().createdAt?.toDate?.() || templateSnap.data().createdAt,
    } as CommunityTemplate;
  } catch (error) {
    console.error('Error getting template:', error);
    throw error;
  }
}

/**
 * 템플릿 저장
 */
export async function saveTemplate(template: Omit<CommunityTemplate, 'templateId' | 'createdAt'> & { templateId?: string }): Promise<string> {
  try {
    const templateId = template.templateId || `template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const templateRef = doc(db, 'communityTemplates', templateId);
    
    // undefined 값 제거 및 필드 정리
    const cleanedFields = template.fields.map(field => {
      const cleaned: any = {
        label: field.label,
        placeholder: field.placeholder,
      };
      
      if (field.required !== undefined) {
        cleaned.required = field.required;
      }
      
      if (field.type) {
        cleaned.type = field.type;
      }
      
      if (field.options && field.options.length > 0) {
        cleaned.options = field.options;
      }
      
      if (field.order !== undefined) {
        cleaned.order = field.order;
      }
      
      return cleaned;
    });
    
    const templateData: any = {
      name: template.name,
      fields: cleanedFields,
      updatedAt: Timestamp.now(),
    };
    
    // 새 템플릿인 경우에만 createdAt 추가
    if (!template.templateId) {
      templateData.createdAt = Timestamp.now();
    }
    
    await setDoc(templateRef, templateData, { merge: true });
    
    return templateId;
  } catch (error) {
    console.error('Error saving template:', error);
    throw error;
  }
}

/**
 * 템플릿 삭제
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  try {
    const templateRef = doc(db, 'communityTemplates', templateId);
    await deleteDoc(templateRef);
  } catch (error) {
    console.error('Error deleting template:', error);
    throw error;
  }
}

/**
 * 활성 템플릿 ID 조회
 */
export async function getActiveTemplateId(): Promise<string | null> {
  try {
    const configRef = doc(db, 'config', 'communityTemplates');
    const configSnap = await getDoc(configRef);
    
    if (!configSnap.exists()) {
      return null;
    }
    
    return configSnap.data().activeTemplateId || null;
  } catch (error) {
    console.error('Error getting active template ID:', error);
    return null;
  }
}

/**
 * 활성 템플릿 설정
 */
export async function setActiveTemplateId(templateId: string | null): Promise<void> {
  try {
    const configRef = doc(db, 'config', 'communityTemplates');
    await setDoc(configRef, {
      activeTemplateId: templateId,
      updatedAt: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('Error setting active template ID:', error);
    throw error;
  }
}

/**
 * 템플릿을 HTML로 변환 (표 형식)
 */
export function applyTemplate(template: CommunityTemplate, values: Record<string, string | string[]>): string {
  try {
    let html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0;">';
    html += '<tbody>';
    
    // 순서대로 정렬
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
        displayValue = Array.isArray(rawValue) ? rawValue.join(', ') : (rawValue as string || '');
      } else {
        displayValue = rawValue as string || '';
      }
      
      if (displayValue || field.required) {
        html += '<tr>';
        html += `<td style="border: 1px solid #ddd; padding: 8px; background-color: #f8f9fa; font-weight: bold; width: 30%;">${field.label}</td>`;
        html += `<td style="border: 1px solid #ddd; padding: 8px; width: 70%;">${displayValue || field.placeholder || ''}</td>`;
        html += '</tr>';
      }
    });
    
    html += '</tbody>';
    html += '</table>';
    
    return html;
  } catch (error) {
    console.error('Error applying template:', error);
    return '';
  }
}

