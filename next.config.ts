import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Review + Library merged into /student/cards (migration 2026-05-30).
    return [
      {
        source: '/student/review',
        destination: '/student/cards',
        permanent: true,
      },
      {
        source: '/student/library',
        destination: '/student/cards',
        permanent: true,
      },
      {
        source: '/student/library/cards/:cardId',
        destination: '/student/cards/:cardId',
        permanent: true,
      },
      {
        source: '/teacher/lessons',
        destination: '/teacher/cards',
        permanent: true,
      },
      {
        source: '/teacher/lessons/:path*',
        destination: '/teacher/cards/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
