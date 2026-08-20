import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { FlatList } from "./flat-list";

describe("FlatList", () => {
  it("renders options via renderItem", () => {
    const options = [
      { value: "a" },
      { value: "b" },
      { value: "c" },
    ];
    render(() => (
      <FlatList
        options={options}
        renderItem={(item) => <span data-testid={`item-${item.value}`}>{item.value}</span>}
      />
    ));
    expect(screen.getByTestId("item-a")).toBeInTheDocument();
    expect(screen.getByTestId("item-b")).toBeInTheDocument();
    expect(screen.getByTestId("item-c")).toBeInTheDocument();
  });

  it("EmptyComponent shows when options.length === 0", () => {
    render(() => (
      <FlatList
        options={[]}
        renderItem={(item) => <span>{item.value}</span>}
        EmptyComponent={<div data-testid="empty">nothing here</div>}
      />
    ));
    expect(screen.getByTestId("empty")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("LoadingComponent shows when isLoading === true (overrides empty)", () => {
    render(() => (
      <FlatList
        options={[]}
        renderItem={(item) => <span>{item.value}</span>}
        isLoading={true}
        LoadingComponent={<div data-testid="loading">please wait</div>}
        EmptyComponent={<div data-testid="empty">nothing here</div>}
      />
    ));
    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.queryByTestId("empty")).not.toBeInTheDocument();
  });

  it("ListSeparatorComponent renders between items", () => {
    const options = [{ value: "a" }, { value: "b" }, { value: "c" }];
    render(() => (
      <FlatList
        options={options}
        renderItem={(item) => <span data-testid={`item-${item.value}`}>{item.value}</span>}
        ListSeparatorComponent={<hr data-testid="sep" />}
      />
    ));
    const separators = screen.getAllByTestId("sep");
    expect(separators.length).toBe(2);
    expect(screen.getByTestId("item-a")).toBeInTheDocument();
    expect(screen.getByTestId("item-b")).toBeInTheDocument();
    expect(screen.getByTestId("item-c")).toBeInTheDocument();
  });

  it("data-testid passes through to ul", () => {
    render(() => (
      <FlatList
        options={[{ value: "a" }]}
        renderItem={(item) => <li>{item.value}</li>}
        data-testid="my-list"
      />
    ));
    const ul = screen.getByRole("list");
    expect(ul.getAttribute("data-testid")).toBe("my-list");
  });
});
