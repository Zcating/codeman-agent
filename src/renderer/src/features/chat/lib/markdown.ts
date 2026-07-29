//! markdown.ts — markdown-it + DOMPurify 渲染模块。
//!
//! 导出 renderMarkdown(src: string): string
//! 配置: html:false, linkify:true, breaks:false, typographer:true
//! GFM: table, strikethrough
//! 插件: markdown-it-task-lists
//! XSS 防护: html:false(第一道) + DOMPurify.sanitize(第二道)

import MarkdownIt from "markdown-it";
import markdownItTaskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: true,
});

md.enable(["table", "strikethrough"]);

md.use(markdownItTaskLists);

export function renderMarkdown(src: string): string {
  const raw = md.render(src);
  return DOMPurify.sanitize(raw);
}
