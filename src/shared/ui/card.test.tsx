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
  it("渲染 rounded-lg 和 border", () => {
    const { container } = render(() => <Card>test</Card>);
    const className = container.querySelector("div")?.className ?? "";
    expect(className).toContain("rounded-lg");
    expect(className).toContain("border");
  });
});

describe("CardHeader", () => {
  it("渲染 p-6 和 flex flex-col", () => {
    const { container } = render(() => <CardHeader>test</CardHeader>);
    const className = container.querySelector("div")?.className ?? "";
    expect(className).toContain("p-6");
    expect(className).toContain("flex flex-col");
  });
});

describe("CardTitle", () => {
  it("渲染为 h3 且有 text-2xl", () => {
    const { container } = render(() => <CardTitle>test</CardTitle>);
    const el = container.querySelector("h3");
    expect(el).not.toBeNull();
    expect(el?.className).toContain("text-2xl");
  });
});

describe("CardDescription", () => {
  it("渲染为 p 且有 text-muted-foreground", () => {
    const { container } = render(() => <CardDescription>test</CardDescription>);
    const el = container.querySelector("p");
    expect(el).not.toBeNull();
    expect(el?.className).toContain("text-muted-foreground");
  });
});

describe("CardContent", () => {
  it("渲染且有 pt-0", () => {
    const { container } = render(() => <CardContent>test</CardContent>);
    const className = container.querySelector("div")?.className ?? "";
    expect(className).toContain("pt-0");
  });
});

describe("CardFooter", () => {
  it("渲染且有 items-center", () => {
    const { container } = render(() => <CardFooter>test</CardFooter>);
    const className = container.querySelector("div")?.className ?? "";
    expect(className).toContain("items-center");
  });
});

describe("CardAction", () => {
  it("渲染且有 items-center", () => {
    const { container } = render(() => <CardAction>test</CardAction>);
    const className = container.querySelector("div")?.className ?? "";
    expect(className).toContain("items-center");
  });
});
