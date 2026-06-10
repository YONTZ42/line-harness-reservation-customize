import { extractFlexAltText } from '../utils/flex-alt-text.js';
import type { Message } from '@line-crm/line-sdk';

const MAX_LINE_MESSAGES = 5;
const MAX_FLEX_CAROUSEL_BUBBLES = 12;

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLineMessageObject(value: unknown): value is AnyRecord {
  return isRecord(value) && typeof value.type === 'string' && ['text', 'image', 'flex'].includes(value.type);
}

function isFlexBubble(value: unknown): value is AnyRecord {
  return isRecord(value) && value.type === 'bubble';
}

function cleanEmptyNodes(obj: unknown): void {
  if (!isRecord(obj)) return;
  for (const key of ['header', 'body', 'footer']) {
    if (obj[key]) cleanEmptyNodes(obj[key]);
  }
  if (Array.isArray(obj.contents)) {
    for (const child of obj.contents) cleanEmptyNodes(child);
    obj.contents = obj.contents.filter((child) => {
      if (!isRecord(child)) return true;
      if (child.type === 'text') {
        return typeof child.text === 'string' && child.text.trim().length > 0;
      }
      if (child.type === 'box' && Array.isArray(child.contents)) {
        const texts = child.contents.filter((item): item is AnyRecord => isRecord(item) && item.type === 'text');
        if (texts.length >= 2) {
          return !texts.some((item) => typeof item.text === 'string' && item.text.trim() === '');
        }
      }
      return true;
    });
  }
}

export function normalizeFlexContents(contents: unknown): unknown {
  if (Array.isArray(contents)) {
    return {
      type: 'carousel',
      contents: contents.filter(isFlexBubble).slice(0, MAX_FLEX_CAROUSEL_BUBBLES),
    };
  }

  if (isRecord(contents) && contents.type === 'carousel' && Array.isArray(contents.contents)) {
    return {
      ...contents,
      contents: contents.contents.filter(isFlexBubble).slice(0, MAX_FLEX_CAROUSEL_BUBBLES),
    };
  }

  return contents;
}

function messageObjectToLineMessage(input: AnyRecord, altText?: string): Message | null {
  if (input.type === 'text' && typeof input.text === 'string') {
    return { type: 'text', text: input.text };
  }

  if (
    input.type === 'image' &&
    typeof input.originalContentUrl === 'string' &&
    typeof input.previewImageUrl === 'string'
  ) {
    return {
      type: 'image',
      originalContentUrl: input.originalContentUrl,
      previewImageUrl: input.previewImageUrl,
    };
  }

  if (input.type === 'flex') {
    const contents = normalizeFlexContents(input.contents);
    cleanEmptyNodes(contents);
    return {
      type: 'flex',
      altText: typeof input.altText === 'string' ? input.altText : altText || extractFlexAltText(contents),
      contents,
    };
  }

  return null;
}

function parseMessageObjectArray(messageContent: string, altText?: string): Message[] | null {
  try {
    const parsed = JSON.parse(messageContent) as unknown;
    if (!Array.isArray(parsed) || parsed.every(isFlexBubble)) return null;
    const messages = parsed
      .filter(isLineMessageObject)
      .slice(0, MAX_LINE_MESSAGES)
      .map((item) => messageObjectToLineMessage(item, altText))
      .filter((item): item is Message => Boolean(item));
    return messages.length ? messages : null;
  } catch {
    return null;
  }
}

export function buildMessages(messageType: string, messageContent: string, altText?: string): Message[] {
  const messageObjectArray = parseMessageObjectArray(messageContent, altText);
  if (messageObjectArray) return messageObjectArray;

  return [buildMessage(messageType, messageContent, altText)];
}

export function buildMessage(messageType: string, messageContent: string, altText?: string): Message {
  if (messageType === 'text') {
    return { type: 'text', text: messageContent };
  }

  if (messageType === 'image') {
    try {
      const parsed = JSON.parse(messageContent) as {
        originalContentUrl: string;
        previewImageUrl: string;
      };
      return {
        type: 'image',
        originalContentUrl: parsed.originalContentUrl,
        previewImageUrl: parsed.previewImageUrl,
      };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  if (messageType === 'flex') {
    try {
      const contents = normalizeFlexContents(JSON.parse(messageContent));
      cleanEmptyNodes(contents);
      return { type: 'flex', altText: altText || extractFlexAltText(contents), contents };
    } catch {
      return { type: 'text', text: messageContent };
    }
  }

  return { type: 'text', text: messageContent };
}

export function addVariationToSingleTextMessage(messages: Message[], batchIndex: number, vary: (text: string, index: number) => string): Message[] {
  if (messages.length !== 1 || messages[0].type !== 'text') return messages;
  return [{ ...messages[0], text: vary(messages[0].text, batchIndex) }];
}
