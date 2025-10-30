import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Files, BarChart3, Settings, History, Briefcase, Archive, Megaphone, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { AUTHORIZED_ADMINS } from '@/lib/constants';

const NAV_STRUCTURE = [
    {
        name: 'Primary',
        items: [
            { name: 'Home', href: '/', icon: LayoutDashboard },
            { name: 'Patients', href: '/patients', icon: Users },
            { name: 'Territory', href: '/marketing', icon: Megaphone },
            { name: 'Payers', href: '/my-accounts', icon: Briefcase },
        ]
    },
    {
        name: 'Insights',
        items: [
            { name: 'Analytics', href: '/trends', icon: BarChart3 },
        ]
    },
    {
        name: 'More',
        items: [
             { name: 'Archive', href: '/archived', icon: Archive },
        ]
    },
    {
        name: 'Administration',
        adminOnly: true,
        items: [
            { name: 'Settings', href: '/settings', icon: Settings },
            { name: 'Activity Log', href: '/audit-log', icon: History },
        ]
    }
];

const NavItem: React.FC<{ item: any }> = ({ item }) => (
    <NavLink
      to={item.href}
      end={item.href === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 px-2 py-2 text-base rounded-lg focus-ring',
          isActive ? 'bg-sky-100 text-sky-800 font-semibold dark:bg-sky-900/50 dark:text-sky-200' : 'text-gray-700 dark:text-gray-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-700 dark:hover:text-sky-300 font-medium'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            className={cn(
              'h-5 w-5',
              isActive ? 'text-sky-600 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-sky-600 dark:group-hover:text-sky-400'
            )}
          />
          {item.name}
        </>
      )}
    </NavLink>
);

const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const isAuthorizedAdmin = useMemo(() => AUTHORIZED_ADMINS.includes(user?.email || ''), [user]);

  return (
    <div className="hidden md:flex md:w-48 md:fixed md:inset-y-0">
      <div className="flex min-h-0 flex-1 flex-col bg-surface border-r border-border-color">
        <div className="flex h-12 items-center px-4">
          <span className="text-lg font-bold text-sky-700 dark:text-sky-300">Patient Sync</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <nav id="tour-step-5-nav" className="space-y-3">
            {NAV_STRUCTURE.map((group) => {
              if (group.adminOnly && !isAuthorizedAdmin) return null;
              
              const visibleItems = group.items;

              if (visibleItems.length === 0) return null;

              return (
                <div key={group.name}>
                  {group.name !== 'Primary' && (
                    <h3 className="px-2 text-xs font-semibold uppercase text-muted tracking-wider mb-1">
                      {group.name}
                    </h3>
                  )}
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => <NavItem key={item.name} item={item} />)}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
