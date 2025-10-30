import React from 'react';
import type { Patient, Order } from '@/lib/types';
import { cn } from '@/lib/utils';
import { highlight } from '@/lib/highlight';
import { MoreVertical, Edit, Eye, Archive, RotateCcw, Trash2, FileText, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/Checkbox';
import { StoplightBadge } from '@/components/ui/StoplightBadge';

interface PatientListItemProps {
  patient: Patient;
  latestOrder: Order | null;
  isSelected: boolean;
  onToggleSelection: () => void;
  onViewDetails: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onStageChange: () => void;
  onExportSnapshot: () => void;
  isExporting: boolean;
  onUpdate: () => void;
  onMenuToggle: (isOpen: boolean) => void;
  term?: string;
  index: number;
}

const PatientListItem: React.FC<PatientListItemProps> = ({
  patient,
  latestOrder,
  isSelected,
  onToggleSelection,
  onViewDetails,
  onEdit,
  onArchive,
  onDelete,
  onStageChange,
  onExportSnapshot,
  isExporting,
  onUpdate,
  onMenuToggle,
  term,
  index,
}) => {
  const isArchived = patient.archived === true || latestOrder?.is_archived === true || ['Delivered', 'Closed', 'Archived'].includes(latestOrder?.status || '');
  const statusDisplay = isArchived ? 'Archived' : (latestOrder?.workflow_stage || 'Active');
  const patientName = patient.name || '';

  const accentColorMap = {
    green: 'before:from-emerald-400/60 before:to-transparent',
    yellow: 'before:from-amber-400/60 before:to-transparent',
    red: 'before:from-rose-400/60 before:to-transparent',
  };
  const accentColorClass = accentColorMap[patient.stoplight_status || 'green'];

  return (
    <li
      onClick={onViewDetails}
      className={cn(
        "relative grid grid-cols-[auto_minmax(0,1fr)_150px_auto] items-center gap-4 p-4 pl-5",
        "transition-colors cursor-pointer",
        "border border-sky-100 rounded-lg shadow-sm mb-2",
        // Gradient pseudo-element for the left accent
        "before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-24 before:bg-gradient-to-r before:pointer-events-none before:rounded-l-lg",
        accentColorClass,
        // Alternating row colors
        index % 2 === 0 ? 'bg-white/95 dark:bg-zinc-900/90' : 'bg-sky-50/50 dark:bg-zinc-900/60',
        isSelected ? "ring-2 ring-teal-500" : "hover:bg-sky-50 dark:hover:bg-zinc-800/50",
        isArchived && "opacity-60"
      )}
    >
      {/* Col 1: Checkbox */}
      <div onClick={(e) => { e.stopPropagation(); onToggleSelection(); }}>
        <Checkbox
          label=""
          checked={isSelected}
          onChange={onToggleSelection}
          className="h-4 w-4"
        />
      </div>

      {/* Col 2: Main Info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StoplightBadge color={patient.stoplight_status || 'green'} />
          <p
            className="font-bold text-sm uppercase text-text truncate"
            dangerouslySetInnerHTML={{ __html: highlight(patientName.toUpperCase(), term || '') }}
          />
        </div>
        <p className="text-xs text-muted truncate pl-5">{patient.primary_insurance || 'N/A'}</p>
      </div>

      {/* Col 3: Case Status */}
      <div className="text-right">
        <div className="text-xs text-muted hidden md:block">Case Status</div>
        <div className="text-sm font-semibold text-text bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full inline-block mt-0.5">
          {statusDisplay}
        </div>
      </div>

      {/* Col 4: Actions */}
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu onOpenChange={onMenuToggle}>
          <DropdownMenuTrigger asChild>
            <button className="p-2 -mr-2 rounded-full text-muted hover:bg-gray-100 dark:hover:bg-zinc-800" aria-label="More options">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onViewDetails}><Eye className="h-4 w-4 mr-2"/>View Details</DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}><Edit className="h-4 w-4 mr-2"/>Edit Patient</DropdownMenuItem>
            <DropdownMenuItem onClick={onStageChange} disabled={!latestOrder}><Edit className="h-4 w-4 mr-2"/>Change Stage</DropdownMenuItem>
            <DropdownMenuItem onClick={onExportSnapshot} disabled={!latestOrder || isExporting} title={!latestOrder ? "Patient has no active referral to generate a snapshot from." : "Export Snapshot PDF"}>
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              {isExporting ? 'Generating...' : 'Export Snapshot'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive} className={patient.archived ? "text-blue-600" : "text-amber-600"}>
              {patient.archived ? <RotateCcw className="h-4 w-4 mr-2"/> : <Archive className="h-4 w-4 mr-2"/>}
              {patient.archived ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600 dark:text-error">
              <Trash2 className="h-4 w-4 mr-2"/>
              Delete Patient
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
};

export default PatientListItem;
