import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("渲染 children 文本", () => {
    render(<Button>提交</Button>);
    expect(screen.getByText("提交")).toBeInTheDocument();
  });

  it("icon 模式显示箭头图标", () => {
    render(<Button icon>下一步</Button>);
    // 箭头图标渲染为 svg（Phosphor 图标），检查文本和图标容器都存在
    expect(screen.getByText("下一步")).toBeInTheDocument();
    // 图标容器 div 存在
    const iconDiv = document.querySelector(".rounded-full.bg-white\\/20");
    expect(iconDiv).toBeTruthy();
  });

  it("非 icon 模式不显示图标容器", () => {
    render(<Button>普通按钮</Button>);
    const iconDiv = document.querySelector(".rounded-full.bg-white\\/20");
    expect(iconDiv).toBeNull();
  });

  it("disabled 属性传递到 button", () => {
    render(<Button disabled>禁用</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("点击触发 onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点我</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("type=submit 传递到按钮", () => {
    render(<Button type="submit">保存</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
