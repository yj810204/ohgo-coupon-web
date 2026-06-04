export interface Emoji {
  emojiId: string;
  name: string;
  imageUrl: string;
  order: number;
}

export interface EmojiPack {
  packId: string;
  name: string;
  description?: string;
  emojis: Emoji[];
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function extractEmojiIds(text: string): string[] {
  const emojiPattern = /:([a-zA-Z0-9_]+):/g;
  const matches = text.matchAll(emojiPattern);
  const emojiIds: string[] = [];
  for (const match of matches) {
    if (match[1]) emojiIds.push(match[1]);
  }
  return [...new Set(emojiIds)];
}

export function renderEmojisInText(text: string, emojiMap: Record<string, string>): string {
  return text.replace(/:([a-zA-Z0-9_]+):/g, (match, emojiId) => {
    const imageUrl = emojiMap[emojiId];
    if (imageUrl) {
      return `<img src="${imageUrl}" alt=":${emojiId}:" class="emoji-inline" style="width: 20px; height: 20px; vertical-align: middle; display: inline-block;" />`;
    }
    return match;
  });
}
