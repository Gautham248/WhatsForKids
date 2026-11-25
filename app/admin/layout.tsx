"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: [string, string][] = [
  ["/admin", "Pipeline"],
  ["/admin/scraper", "Scraper"],
  ["/admin/diffs", "Approvals"],
  ["/admin/csv", "CSV"],
  ["/admin/events", "Events"],
  ["/admin/ops", "Ops & demo controls"],
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="wrap">
      <div className="subnav">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={"btn sm" + (path === href || (href === "/admin" && path.startsWith("/admin/p/")) ? " primary" : "")}>
            {label}
          </Link>
        ))}
        <span className="spacer" />
        <span className="muted small">Curation lane · no login in this demo (real build: Google login, allowlist, roles: curator / approver / owner)</span>
      </div>
      {children}
    </div>
  );
}
