import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileTabBar } from "@/components/ui/MobileTabBar";

// Mock next/navigation
const mockPathname = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// Mock next/link（渲染普通 <a> 标签方便测试）
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function getLinkClass(href: string): string {
  const link = screen.getByRole("link", { name: new RegExp(href) });
  // 实际上我们用 tab label 来找，改一下方法
  return link.className;
}

describe("MobileTabBar", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/dashboard");
  });

  it("渲染 6 个标签", () => {
    render(<MobileTabBar />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
  });

  it("标签包含正确文字", () => {
    render(<MobileTabBar />);
    expect(screen.getByText("仪表盘")).toBeInTheDocument();
    expect(screen.getByText("录入")).toBeInTheDocument();
    expect(screen.getByText("统计")).toBeInTheDocument();
    expect(screen.getByText("进度")).toBeInTheDocument();
    expect(screen.getByText("错题本")).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
  });

  it("当前路由高亮（blue-600）", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<MobileTabBar />);
    const dashboardLink = screen.getByText("仪表盘").closest("a");
    expect(dashboardLink?.className).toContain("text-blue-600");
  });

  it("非当前路由不高亮", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<MobileTabBar />);
    const settingsLink = screen.getByText("设置").closest("a");
    expect(settingsLink?.className).not.toContain("text-blue-600");
    expect(settingsLink?.className).toContain("text-zinc-400");
  });

  it("根路径 / 视为仪表盘高亮", () => {
    mockPathname.mockReturnValue("/");
    render(<MobileTabBar />);
    const dashboardLink = screen.getByText("仪表盘").closest("a");
    expect(dashboardLink?.className).toContain("text-blue-600");
  });

  it("/upload/confirm 视为录入高亮", () => {
    mockPathname.mockReturnValue("/upload/confirm");
    render(<MobileTabBar />);
    const uploadLink = screen.getByText("录入").closest("a");
    expect(uploadLink?.className).toContain("text-blue-600");
  });

  it("/review/1 视为错题本高亮", () => {
    mockPathname.mockReturnValue("/review/1");
    render(<MobileTabBar />);
    const browseLink = screen.getByText("错题本").closest("a");
    expect(browseLink?.className).toContain("text-blue-600");
  });

  it("/question/123 视为仪表盘高亮", () => {
    mockPathname.mockReturnValue("/question/123");
    render(<MobileTabBar />);
    const dashboardLink = screen.getByText("仪表盘").closest("a");
    expect(dashboardLink?.className).toContain("text-blue-600");
  });

  it("切换路由后高亮跟随变化", () => {
    mockPathname.mockReturnValue("/settings");
    render(<MobileTabBar />);
    const settingsLink = screen.getByText("设置").closest("a");
    expect(settingsLink?.className).toContain("text-blue-600");
  });
});
