import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { SlidersHorizontal, X, Plus } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import MultiSelect from '@/components/ui/MultiSelect';
import { Button } from '@/components/ui/button';
import MarketingFilterDrawer from './MarketingFilterDrawer';
import type { LeadStatus, MarketingEventType, InServiceStatus } from '@/lib/types';
import { marketingEventTypeOptions } from '@/lib/formConstants';

interface MarketingFilterBarProps {
  activeView: 'leads' | 'events' | 'journal';
  
  leadFilters: { status: LeadStatus[], type: string[] };
  onLeadFilterChange: (filterName: string, value: string[]) => void;
  onClearLeadFilters: () => void;
  leadTypeOptions: { value: string, label: string }[];
  leadStatusOptions: { value: string, label: string }[];

  eventFilters: { type: MarketingEventType[], status: InServiceStatus[] };
  onEventFilterChange: (filterName: string, value: string[]) => void;
  onClearEventFilters: () => void;
  eventStatusOptions: { value: string, label: string }[];

  onScheduleEvent: () => void;
}

const MarketingFilterBar: React.FC<MarketingFilterBarProps> = (props) => {
  const { activeView } = props;
  const barRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isCollapsed = isMobile;

  const activeLeadFilterCount = props.leadFilters.status.length + props.leadFilters.type.length;
  const activeEventFilterCount = props.eventFilters.status.length + props.eventFilters.type.length;
  const activeFilterCount = activeView === 'leads' ? activeLeadFilterCount : activeEventFilterCount;

  const renderExpandedFilters = () => {
    if (activeView === 'leads') {
      return (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <MultiSelect label="Status" options={props.leadStatusOptions} selected={props.leadFilters.status} onChange={(s) => props.onLeadFilterChange('status', s as LeadStatus[])} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <MultiSelect label="Type" options={props.leadTypeOptions} selected={props.leadFilters.type} onChange={(s) => props.onLeadFilterChange('type', s)} />
          </div>
          {activeLeadFilterCount > 0 && <div className="md:ml-auto"><Button variant="ghost" size="sm" onClick={props.onClearLeadFilters}><X className="h-4 w-4 mr-1" />Clear</Button></div>}
        </div>
      );
    }
    if (activeView === 'events') {
      return (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <MultiSelect label="Event Type" options={marketingEventTypeOptions} selected={props.eventFilters.type} onChange={(s) => props.onEventFilterChange('type', s as MarketingEventType[])} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <MultiSelect label="Status" options={props.eventStatusOptions} selected={props.eventFilters.status} onChange={(s) => props.onEventFilterChange('status', s as InServiceStatus[])} />
          </div>
          {activeEventFilterCount > 0 && <div className="md:ml-auto"><Button variant="ghost" size="sm" onClick={props.onClearEventFilters}><X className="h-4 w-4 mr-1" />Clear</Button></div>}
          <div className="ml-auto">
            <Button onClick={() => props.onScheduleEvent()}><Plus className="h-4 w-4 mr-2" />Schedule Event</Button>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCollapsedPill = () => (
    <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => setIsDrawerOpen(true)}>
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filters
            {activeFilterCount > 0 && <span className="ml-2 bg-accent text-white h-5 w-5 text-xs flex items-center justify-center rounded-full">{activeFilterCount}</span>}
        </Button>
        {activeView === 'events' && (
             <Button onClick={() => props.onScheduleEvent()}><Plus className="h-4 w-4 mr-2" />Schedule Event</Button>
        )}
    </div>
  );

  if (activeView === 'journal') {
    return <div ref={barRef} />;
  }

  return (
    <>
      <div
        ref={barRef}
        className="bg-surface/80 dark:bg-zinc-900/80 backdrop-blur-lg p-3 border-b border-border-color"
      >
        <motion.div
          animate={isCollapsed ? 'collapsed' : 'expanded'}
          variants={{
            expanded: { opacity: 1, height: 'auto' },
            collapsed: { opacity: 1, height: 'auto' },
          }}
          transition={{ duration: 0.2 }}
        >
          {isCollapsed ? renderCollapsedPill() : renderExpandedFilters()}
        </motion.div>
      </div>
      <MarketingFilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        {...props}
      />
    </>
  );
};

export default MarketingFilterBar;
