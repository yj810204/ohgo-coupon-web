import { getSettingsValue, setSettingsValue } from '@/lib/settings-store';
import type { CommunityTemplate } from './community-template-shared';

const SETTINGS_KEY = 'community_templates';

type TemplatesStore = {
  activeTemplateId: string | null;
  items: CommunityTemplate[];
};

async function readStore(): Promise<TemplatesStore> {
  return getSettingsValue<TemplatesStore>(SETTINGS_KEY, { activeTemplateId: null, items: [] });
}

async function writeStore(store: TemplatesStore): Promise<void> {
  await setSettingsValue(SETTINGS_KEY, store);
}

export async function getTemplates(): Promise<CommunityTemplate[]> {
  const store = await readStore();
  return [...store.items].sort((a, b) => {
    const ta = new Date(String(a.createdAt)).getTime();
    const tb = new Date(String(b.createdAt)).getTime();
    return tb - ta;
  });
}

export async function getTemplate(templateId: string): Promise<CommunityTemplate | null> {
  const store = await readStore();
  return store.items.find((t) => t.templateId === templateId) ?? null;
}

export async function saveTemplate(
  template: Omit<CommunityTemplate, 'templateId' | 'createdAt'> & { templateId?: string },
): Promise<string> {
  const store = await readStore();
  const templateId =
    template.templateId || `template_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  const existingIdx = store.items.findIndex((t) => t.templateId === templateId);

  const next: CommunityTemplate = {
    templateId,
    name: template.name,
    fields: template.fields,
    createdAt: existingIdx >= 0 ? store.items[existingIdx].createdAt : now,
  };

  if (existingIdx >= 0) store.items[existingIdx] = next;
  else store.items.push(next);

  await writeStore(store);
  return templateId;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const store = await readStore();
  store.items = store.items.filter((t) => t.templateId !== templateId);
  if (store.activeTemplateId === templateId) store.activeTemplateId = null;
  await writeStore(store);
}

export async function getActiveTemplateId(): Promise<string | null> {
  const store = await readStore();
  return store.activeTemplateId;
}

export async function setActiveTemplateId(templateId: string | null): Promise<void> {
  const store = await readStore();
  store.activeTemplateId = templateId;
  await writeStore(store);
}
