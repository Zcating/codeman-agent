import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "./card";

describe("Card", () => {
  it("renders with shadcn-style classes", () => {
    const { container } = render(() => <Card>test</Card>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("flex-col");
    expect(el.className).toContain("rounded-xl");
    expect(el.className).toContain("bg-card");
  });

  it("has data-slot=card", () => {
    const { container } = render(() => <Card>test</Card>);
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("card");
  });

  it("size=sm sets data-size=sm", () => {
    const { container } = render(() => <Card size="sm">test</Card>);
    expect(container.firstElementChild!.getAttribute("data-size")).toBe("sm");
  });

  it("size=default sets data-size=default", () => {
    const { container } = render(() => <Card>test</Card>);
    expect(container.firstElementChild!.getAttribute("data-size")).toBe("default");
  });
});

describe("CardHeader", () => {
  it("renders with grid classes", () => {
    const { container } = render(() => <CardHeader>test</CardHeader>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("grid");
    expect(el.className).toContain("rounded-t-xl");
  });

  it("has data-slot=card-header", () => {
    const { container } = render(() => <CardHeader>test</CardHeader>);
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("card-header");
  });
});

describe("CardTitle", () => {
  it("renders as div with cn-font-heading", () => {
    const { container } = render(() => <CardTitle>test</CardTitle>);
    const el = container.firstElementChild!;
    expect(el.tagName).toBe("DIV");
    expect(el.className).toContain("cn-font-heading");
    expect(el.className).toContain("font-medium");
  });

  it("has data-slot=card-title", () => {
    const { container } = render(() => <CardTitle>test</CardTitle>);
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("card-title");
  });
});

describe("CardDescription", () => {
  it("renders as div with text-muted-foreground", () => {
    const { container } = render(() => <CardDescription>test</CardDescription>);
    const el = container.firstElementChild!;
    expect(el.tagName).toBe("DIV");
    expect(el.className).toContain("text-muted-foreground");
  });

  it("has data-slot=card-description", () => {
    const { container } = render(() => <CardDescription>test</CardDescription>);
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("card-description");
  });
});

describe("CardAction", () => {
  it("renders with grid helpers", () => {
    const { container } = render(() => <CardAction>test</CardAction>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("col-start-2");
    expect(el.className).toContain("justify-self-end");
  });

  it("has data-slot=card-action", () => {
    const { container } = render(() => <CardAction>test</CardAction>);
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("card-action");
  });
});

describe("CardContent", () => {
  it("renders with px class", () => {
    const { container } = render(() => <CardContent>test</CardContent>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("px-(");
    expect(el.className).toContain("card-spacing");
  });

  it("has data-slot=card-content", () => {
    const { container } = render(() => <CardContent>test</CardContent>);
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("card-content");
  });
});

describe("CardFooter", () => {
  it("renders with border-t and bg-muted", () => {
    const { container } = render(() => <CardFooter>test</CardFooter>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("border-t");
    expect(el.className).toContain("bg-muted/50");
    expect(el.className).toContain("rounded-b-xl");
  });

  it("has data-slot=card-footer", () => {
    const { container } = render(() => <CardFooter>test</CardFooter>);
    expect(container.firstElementChild!.getAttribute("data-slot")).toBe("card-footer");
  });
});
