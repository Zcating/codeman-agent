import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

turndown.remove(["script", "style", "meta", "link"]);

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

const TAG_RE = /<\/?(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_STRIP_RE = /<[^>]*>/g;
const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function htmlToText(html: string): string {
  const noScripts = html.replace(TAG_RE, "");
  const noTags = noScripts.replace(TAG_STRIP_RE, "");
  return noTags.replace(/&(?:#x?[0-9a-f]+|[a-z]+);/gi, (m) => ENTITY_MAP[m] ?? m);
}
