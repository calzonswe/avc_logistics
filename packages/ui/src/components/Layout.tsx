import { type HTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '../utils/index.js';
import { Button } from './Button.js';
import { SyncStatusIndicator } from './SyncStatus.js';

export interface LayoutProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  header?: React.ReactNode;
  /** Actions rendered in the header (e.g. the notification bell). */
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  sidebarWidth?: 'sm' | 'md' | 'lg';
  collapsible?: boolean;
  defaultSidebarOpen?: boolean;
}

export function Layout({
  children,
  sidebar,
  header,
  headerActions,
  footer,
  sidebarWidth = 'md',
  collapsible = false,
  defaultSidebarOpen = false,
  className,
  ...props
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const sidebarWidths = {
    sm: 'w-56',
    md: 'w-64',
    lg: 'w-72',
  };

  return (
    <div className={cn('flex h-screen bg-gray-50', className)} {...props}>
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      {sidebar && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0',
            // On small screens the sidebar is off-screen until the menu button
            // is used (it must never cover the content on a phone).
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            mobileSidebarOpen ? 'translate-x-0' : '',
            sidebarWidths[sidebarWidth]
          )}
          aria-label="Sidomeny"
        >
          <div className="flex flex-col h-full">
            <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 lg:hidden">
              <h2 className="text-lg font-semibold text-gray-900">Meny</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Stäng meny"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">{sidebar}</nav>
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className={cn('flex-1 flex flex-col lg:ml-0', sidebar && !sidebarOpen && 'lg:ml-0')}>
        {/* Top header — one element for both breakpoints, so the header actions
            (e.g. the notification bell) exist exactly once and keep their
            state. The menu button only shows on small screens. */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex h-14 lg:h-16 items-center justify-between px-4 sm:px-6 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {sidebar && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setMobileSidebarOpen(true)}
                  aria-label="Öppna meny"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </Button>
              )}
              <div className="min-w-0 truncate">{header}</div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {headerActions}
              <SyncStatusIndicator />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>

        {/* Footer */}
        {footer && (
          <footer className="border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export interface SidebarNavProps {
  items: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: React.ReactNode;
    badge?: string | number;
    active?: boolean;
    disabled?: boolean;
    children?: Array<{
      label: string;
      href?: string;
      onClick?: () => void;
    }>;
  }>;
  className?: string;
}

export function SidebarNav({ items, className }: SidebarNavProps) {
  return (
    <nav className={cn('space-y-1', className)} aria-label="Huvudnavigering">
      {items.map((item, index) => (
        <div key={index}>
          {item.children ? (
            <details className="group">
              <summary className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer list-none">
                {item.icon}
                {item.label}
                {item.badge && <span className="ml-auto text-xs text-gray-500">{item.badge}</span>}
                <svg className="ml-auto w-4 h-4 text-gray-400 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </summary>
              <ul className="mt-1 ml-6 space-y-1 border-l border-gray-200 pl-3">
                {item.children.map((child, childIndex) => (
                  <li key={childIndex}>
                    <a
                      href={child.href}
                      onClick={child.onClick ? (e) => { e.preventDefault(); child.onClick!(); } : undefined}
                      className="block px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg"
                    >
                      {child.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <a
              href={item.href}
              onClick={item.onClick ? (e) => { e.preventDefault(); item.onClick!(); } : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                item.active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
              aria-current={item.active ? 'page' : undefined}
              aria-disabled={item.disabled}
            >
              {item.icon}
              {item.label}
              {item.badge && (
                <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                  {item.badge}
                </span>
              )}
            </a>
          )}
        </div>
      ))}
    </nav>
  );
}

export interface UserMenuProps {
  user: {
    name: string;
    email: string;
    avatar?: string;
    role: string;
  };
  onProfileClick?: () => void;
  onSettingsClick?: () => void;
  onLogoutClick?: () => void;
}

export function UserMenu({ user, onProfileClick, onSettingsClick, onLogoutClick }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:block text-right">
        <p className="text-sm font-medium text-gray-900">{user.name}</p>
        <p className="text-xs text-gray-500 capitalize">{user.role}</p>
      </div>
      <div className="relative">
        <button
          className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100"
          aria-label="Användarmeny"
        >
          {user.avatar ? (
            <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-sm font-medium text-blue-700">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}