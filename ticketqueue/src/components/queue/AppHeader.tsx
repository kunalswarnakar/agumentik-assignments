import { Link } from "@tanstack/react-router";
import { Headphones } from "lucide-react";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-primary-foreground shadow-[var(--shadow-elegant)]"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Headphones className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">QueueIQ</div>
            <div className="text-[11px] text-muted-foreground">Smart Support Queue</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-lg px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
          >
            Customer
          </Link>
          <Link
            to="/admin"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-lg px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
          >
            Admin
          </Link>
          <Link
            to="/agents"
            activeProps={{ className: "bg-secondary text-secondary-foreground" }}
            className="rounded-lg px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
          >
            Agents
          </Link>
        </nav>
      </div>
    </header>
  );
}