import React from 'react';
import SlideOver from '../ui/SlideOver';
import { useAnalyticsFilters } from '@/state/useAnalyticsFilters';
import MultiSelect from '../ui/MultiSelect';
import { Select } from '../ui/Select';
import { Button } from '../ui/button';

interface AnalyticsFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filterOptions?: {
    payers: string[];
    territories: string[];
    stages: string[];
  };
}

const AnalyticsFilterDrawer: React.FC<AnalyticsFilterDrawerProps> = ({ isOpen, onClose, filterOptions }) => {
  const { territories, stages, docsReady, setFilters, reset } = useAnalyticsFilters();

  const toOptions = (items: string[]) => items.map(item => ({ label: item, value: item }));

  return (
    <SlideOver isOpen={isOpen} onClose={onClose} title="Advanced Analytics Filters">
      <div className="p-6 space-y-6">
        <MultiSelect
          label="Territories"
          options={toOptions(filterOptions?.territories || [])}
          selected={territories}
          onChange={(selected) => setFilters({ territories: selected })}
        />
        <MultiSelect
          label="Stages"
          options={toOptions(filterOptions?.stages || [])}
          selected={stages}
          onChange={(selected) => setFilters({ stages: selected })}
        />
        <Select
          label="Docs Ready Status"
          value={docsReady === null ? 'all' : String(docsReady)}
          onChange={(e) => setFilters({ docsReady: e.target.value === 'all' ? null : e.target.value === 'true' })}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Ready', value: 'true' },
            { label: 'Not Ready', value: 'false' },
          ]}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border-color bg-surface flex gap-3">
        <Button variant="outline" onClick={reset} className="flex-1">Reset All</Button>
        <Button onClick={onClose} className="flex-1">Apply</Button>
      </div>
    </SlideOver>
  );
};

export default AnalyticsFilterDrawer;
