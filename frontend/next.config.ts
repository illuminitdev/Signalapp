import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async redirects() {
    // Old links without a portal prefix (e.g. /accounts/pipeline) still work: the portal guard
    // moves each member to the same page inside their own portal, or to their portal's home.
    const portal = ":portal(admin|researcher|reviewer|sdr|analyst|partner)";
    return [
      // Section roots open the section's first page
      { source: `/${portal}/discover`, destination: "/:portal/discover/assign", permanent: false },
      { source: `/${portal}/accounts`, destination: "/:portal/accounts/pipeline", permanent: false },
      { source: `/${portal}/outreach`, destination: "/:portal/outreach/tasks", permanent: false },
      { source: `/${portal}/reports`, destination: "/:portal/reports/outcomes", permanent: false },

      // Renamed pages
      { source: "/discover/search", destination: "/discover/assign", permanent: true },
      { source: "/discover/feed", destination: "/overview", permanent: true },
      { source: "/accounts/acceptance", destination: "/accounts/sales-acceptance", permanent: true },
      { source: "/tenant-admin/members", destination: "/admin/members", permanent: true },
      { source: "/tenant-admin/workspaces", destination: "/admin/workspaces", permanent: true },
      { source: "/tenant-admin/workspaces/:path*", destination: "/admin/workspaces/:path*", permanent: true },
      { source: "/sales-reviewer", destination: "/reviewer/accounts/sales-acceptance", permanent: true },
    ];
  },
};

export default nextConfig;
