// Role-based home routes - single source of truth for post-login landing pages
export const roleHome = (role?: string | null): string => {
  switch (role) {
    case 'driver':
      return '/driver';
    case 'worker':
      return '/worker';
    case 'admin':
    case 'manager':
    default:
      return '/manager';
  }
};
