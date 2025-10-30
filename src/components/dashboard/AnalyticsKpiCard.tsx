import React from 'react';
import { cn } from '@/lib/utils';

interface AnalyticsKpiCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  onClick?: () => void;
}

const AnalyticsKpiCard: React.FC<AnalyticsKpiCardProps> = ({ title, value, icon: Icon, onClick }) => {
  const isClickable = !!onClick;

  return (
    <div
      className={cn(
        "bg-white rounded-xl shadow-sm p-4 border border-sky-100 dark:bg-zinc-900 dark:border-sky-900/50",
        "border-t-4 border-sky-200 dark:border-t-sky-800",
        "transition-all duration-200",
        isClickable ? "hover:shadow-md hover:border-sky-200 dark:hover:border-sky-700 cursor-pointer focus-ring" : ""
      )}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
    >
      <div className="flex items-start justify-between">
        <div className="bg-sky-100 dark:bg-sky-900/50 p-2 rounded-lg">
          <Icon className="h-5 w-5 text-sky-700 dark:text-sky-300" />
        </div>
      </div>
      <div className="mt-2">
        <p className="text-sm text-gray-700 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-sky-800 dark:text-sky-200">{value}</p>
      </div>
    </div>
  );
};

export default AnalyticsKpiCard;
