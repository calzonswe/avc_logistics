// Routing regression test.
//
// The role views are nested inside splat parent routes ("/manager/*"), and
// React Router strips the parent's pathBase before matching the nested
// <Routes>. With absolute child paths the URL never matches and the content
// area renders completely empty (white/grey body next to the sidebar) — the
// exact symptom reported on 2026-10-21.
//
// This test locks the invariant: child paths are relative and every known URL
// resolves to a route.
import { describe, it, expect } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import {
  MANAGER_PATHS,
  DASHBOARD_PATHS,
  ROLE_SECTIONS,
  KNOWN_URLS,
} from '../routes';

const ALL_PATHS: string[] = [
  ...Object.values(MANAGER_PATHS),
  ...Object.values(DASHBOARD_PATHS),
].filter((p) => p !== '');

describe('role route paths', () => {
  it('are relative (never start with "/") — absolute paths silently break nested matching', () => {
    for (const path of ALL_PATHS) {
      expect(path.startsWith('/')).toBe(false);
    }
  });

  it('resolves every known URL to a route', () => {
    const tree = [
      {
        path: ROLE_SECTIONS.manager,
        children: [
          { index: true, path: undefined },
          ...Object.entries(MANAGER_PATHS)
            .filter(([key]) => key !== 'index')
            .map(([, path]) => ({ path })),
          { path: '*' },
        ],
      },
      {
        path: ROLE_SECTIONS.dashboard,
        children: [
          { index: true, path: undefined },
          { path: DASHBOARD_PATHS.site },
          { path: '*' },
        ],
      },
      { path: ROLE_SECTIONS.driver, children: [{ index: true, path: undefined }, { path: '*' }] },
      { path: ROLE_SECTIONS.worker, children: [{ index: true, path: undefined }, { path: '*' }] },
    ];

    for (const { url } of KNOWN_URLS) {
      const matches = matchRoutes(tree as any, url);
      expect(matches, `no route matched ${url}`).not.toBeNull();
      // The match must be a real route, not only the catch-all fallback.
      const matchedPath = matches![matches!.length - 1].route.path;
      expect(matchedPath, `${url} fell through to the catch-all`).not.toBe('*');
    }
  });

  it('falls back to "not found" for an unknown URL instead of rendering nothing', () => {
    const tree = [
      {
        path: ROLE_SECTIONS.manager,
        children: [{ index: true, path: undefined }, { path: '*' }],
      },
    ];
    const matches = matchRoutes(tree as any, '/manager/does-not-exist');
    expect(matches).not.toBeNull();
    expect(matches![matches!.length - 1].route.path).toBe('*');
  });
});
