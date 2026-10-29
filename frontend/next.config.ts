import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async redirects() {
    return [
      // Default subsection redirects
      { source: "/discover", destination: "/discover/feed", permanent: false },
      { source: "/accounts", destination: "/accounts/watchlist", permanent: false },
      { source: "/accounts/acceptance", destination: "/accounts/sales-acceptance", permanent: true },
      { source: "/outreach", destination: "/outreach/tasks", permanent: false },
      { source: "/reports", destination: "/reports/outcomes", permanent: false },

      // Legacy backwards-compatible redirects
      { source: "/researcher", destination: "/discover/feed", permanent: true },
      { source: "/researcher/:path*", destination: "/discover/:path*", permanent: true },
      { source: "/sdr", destination: "/outreach/tasks", permanent: true },
      { source: "/sdr/:path*", destination: "/outreach/:path*", permanent: true },
      { source: "/tenant-admin/members", destination: "/members", permanent: true },
      { source: "/tenant-admin/workspaces", destination: "/workspaces", permanent: true },
      { source: "/tenant-admin/workspaces/:path*", destination: "/workspaces/:path*", permanent: true },
      { source: "/sales-reviewer", destination: "/accounts/sales-acceptance", permanent: true },
    ];
  },
};

export default nextConfig;
