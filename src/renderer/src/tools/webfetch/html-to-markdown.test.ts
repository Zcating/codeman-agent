import { describe, it, expect } from "vitest";
import { htmlToMarkdown, htmlToText } from "@codeman-frontend/tools/webfetch/html-to-markdown";

describe("htmlToMarkdown", () => {
  it("<h1>hi</h1> → # hi", () => {
    expect(htmlToMarkdown("<h1>hi</h1>").trim()).toBe("# hi");
  });

  it("<p>hello</p> → hello", () => {
    expect(htmlToMarkdown("<p>hello</p>").trim()).toBe("hello");
  });

  it("<ul><li>a</li><li>b</li></ul> contains list items", () => {
    const result = htmlToMarkdown("<ul><li>a</li><li>b</li></ul>");
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result.startsWith("-") || result.includes("\n-")).toBe(true);
  });

  it("<pre><code>const x = 1;</code></pre> contains code block", () => {
    const result = htmlToMarkdown('<pre><code>const x = 1;</code></pre>');
    expect(result).toContain("const x = 1;");
    expect(result).toContain("```");
  });
});

describe("htmlToText", () => {
  it("strips script tags and content", () => {
    expect(htmlToText("<script>x</script><p>hi</p>")).toBe("hi");
  });

  it("strips style tags and content", () => {
    expect(htmlToText("<style>body{color:red}</style><p>hi</p>")).toBe("hi");
  });

  it("decodes HTML entities", () => {
    expect(htmlToText("&amp; &lt;")).toBe("& <");
  });

  it("strips HTML tags from plain text", () => {
    expect(htmlToText("<p>plain</p>")).toBe("plain");
  });

  it("htmlToText strips svg with event handlers", () => {
    expect(htmlToText('<svg onload="alert(1)"><circle/></svg>')).not.toMatch(/onload/);
  });

  it("htmlToText strips iframe content", () => {
    expect(htmlToText('<iframe src="x">inner</iframe>')).toBe("");
  });

  it("htmlToMarkdown removes iframe", () => {
    const out = htmlToMarkdown('<iframe src="evil"></iframe><p>hi</p>');
    expect(out).not.toMatch(/iframe/);
    expect(out).toMatch(/hi/);
  });

it("htmlToText strips unclosed script tag (XSS protection)", () => {
  expect(htmlToText("<script>alert(1)<p>hi</p>")).not.toMatch(/alert/);
  expect(htmlToText("<script>alert(1)<p>hi</p>")).toMatch(/hi/);
});

it("htmlToText strips unclosed iframe tag", () => {
  expect(htmlToText("<iframe src=evil><p>safe</p>")).toMatch(/safe/);
  expect(htmlToText("<iframe src=evil><p>safe</p>")).not.toMatch(/iframe/);
});
});
