import { NextRequest, NextResponse } from "next/server";
export function middleware(request: NextRequest) {
    const user = process.env.DASHBOARD_USER;
    const password = process.env.DASHBOARD_PASSWORD;
    if (!user || !password) {
        if (process.env.NODE_ENV === "production") {
            return new NextResponse("Dashboard authentication is not configured", { status: 503 });
        }
        return NextResponse.next();
    }
    const header = request.headers.get("authorization");
    if (header?.startsWith("Basic ")) {
        const decoded = atob(header.slice(6));
        const separator = decoded.indexOf(":");
        if (separator >= 0) {
            const suppliedUser = decoded.slice(0, separator);
            const suppliedPassword = decoded.slice(separator + 1);
            if (timingSafeStringEqual(suppliedUser, user) && timingSafeStringEqual(suppliedPassword, password)) {
                return NextResponse.next();
            }
        }
    }
    return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="MergeGuard"' },
    });
}
function timingSafeStringEqual(a: string, b: string): boolean {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
export const config = {
    matcher: ["/", "/analyses/:path*"],
};

