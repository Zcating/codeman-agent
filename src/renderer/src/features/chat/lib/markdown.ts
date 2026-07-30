







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
