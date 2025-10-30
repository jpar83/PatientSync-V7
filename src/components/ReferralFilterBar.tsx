import React from 'react';
import { X, SlidersHorizontal, Download } from 'lucide-react';
import { Button } from './ui/button';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSearch } from '../contexts/SearchContext';
import SearchInput from './ui/SearchInput';

interface ReferralFilterBarProps {
  onClearFilters: () => void;
  numSelected: number;
  totalCount: number;
  onOpenAdvanced: () => void;
  isAdvancedFilterActive: boolean;
  onExportClick: () => void;
  id?: string;
  accountFilter: string | null;
}

const ReferralFilterBar: React.FC<ReferralFilterBarProps> = ({
  onClearFilters,
  numSelected,
  totalCount,
  onOpenAdvanced,
  isAdvancedFilterActive,
  onExportClick,
  id,
  accountFilter,
}) => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { term, setTerm } = useSearch();

  return (
    <header
      id={id}
      className="sticky top-0 bg-surface/80 dark:bg-zinc-900/80 backdrop-blur-lg border-b border-black/5 dark:border-white/5 z-20"
      role="region"
      aria-label="Patient list toolbar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 min-h-[48px]">
          {isMobile ? (
            <SearchInput
              value={term}
              onChange={setTerm}
              placeholder="Search patients..."
              className="w-full"
            />
          ) : null}
          
          <div id="tour-referrals-actions-group" className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onOpenAdvanced} className="text-xs !h-auto relative">
              <SlidersHorizontal className="h-4 w-4 mr-1.5" />
              Advanced Filters
              {isAdvancedFilterActive && <span className="absolute -top-0.5 -right-0.5 block h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />}
            </Button>
            
            <Button variant="ghost" size="sm" onClick={onExportClick} className="text-xs !h-auto">
                <Download className="h-4 w-4 mr-1.5" />
                Export
            </Button>

            {isAdvancedFilterActive && (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-xs !h-auto text-red-600 dark:text-red-500">
                    <X className="h-3 w-3 mr-1" />
                    Clear Filters
                </Button>
            )}
          </div>
      </div>
    </header>
  );
};

export default ReferralFilterBar;
