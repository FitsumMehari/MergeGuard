import "./globals.css";
export const metadata = { title: "MergeGuard", description: "AI-assisted PR/MR risk and issue review" };
export default function Layout({ children }: {
    children: React.ReactNode;
}) { return <html lang="en"><body><main className="shell"><nav className="nav"><a className="brand" href="/">MergeGuard</a><span className="muted">Evidence-first code review</span></nav>{children}</main></body></html>; }

