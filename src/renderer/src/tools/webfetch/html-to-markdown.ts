import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

const REMOVED_TAGS = ["script", "style", "meta", "link", "noscript", "iframe", "object", "embed", "svg"];
turndown.remove((node) => REMOVED_TAGS.includes(node.tagName.toLowerCase()));

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

const TAG_RE = /<\/?(script|style|noscript|iframe|object|embed|svg|math|audio|video|picture|form|button)\b[^>]*>[\s\S]*?(?:<\/\1>|(?=<[a-z/])|$)/gi;
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
