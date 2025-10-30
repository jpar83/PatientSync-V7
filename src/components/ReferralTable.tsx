import React, { useMemo } from 'react';
import { Loader2, MoreVertical, Edit, Archive, Eye, RotateCcw, FileText, Trash2 } from 'lucide-react';
import { Btn } from './ui/Btn';
import type { Order } from '../lib/types';
import { highlight } from '../lib/highlight';
import { Checkbox } from './ui/Checkbox';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu';
import StoplightStatusControl from './StoplightStatusControl';
import { cn } from '../lib/utils';

interface ReferralTableProps {
  orders: Order[];
  isLoading: boolean;
  onViewDetails: (order: Order) => void;
  onStageChangeClick: (order: Order) => void;
  onArchiveToggle: (order: Order) => void;
  onDelete: (order: Order) => void;
  onExportSnapshot: (order: Order) => void;
  exportingSnapshotId: string | null;
  term: string;
  selectedOrderIds: string[];
  onToggleSelection: (orderId: string) => void;
  onUpdate: () => void;
}

const ReferralTable: React.FC<ReferralTableProps> = ({
    orders = [],
    isLoading,
    onViewDetails,
    onStageChangeClick,
    onArchiveToggle,
    onDelete,
    onExportSnapshot,
    exportingSnapshotId,
    term,
    selectedOrderIds,
    onToggleSelection,
    onUpdate,
}) => {
  const groupedOrders = useMemo(() => {
    return orders.reduce((acc, order) => {
        const patientName = order.patients?.name || '';
        const firstLetter = patientName?.[0]?.toUpperCase();
        if (firstLetter && /^[A-Z]$/.test(firstLetter)) {
            if (!acc[firstLetter]) acc[firstLetter] = [];
            acc[firstLetter].push(order);
        } else {
            if (!acc['#']) acc['#'] = [];
            acc['#'].push(order);
        }
        return acc;
    }, {} as Record<string, Order[]>);
  }, [orders]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <table className="min-w-full w-full text-sm table-compact">
      <thead className="bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 uppercase text-xs sticky top-0 z-20">
        <tr>
          <th className="p-3 w-12 text-center">
            <Checkbox
                label=""
                checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                indeterminate={selectedOrderIds.length > 0 && selectedOrderIds.length < orders.length}
                onChange={() => {
                    if (selectedOrderIds.length === orders.length) {
                        onToggleSelection('all-off');
                    } else {
                        onToggleSelection('all-on');
                    }
                }}
            />
          </th>
          <th className="p-3 text-left">Patient</th>
          <th className="p-3 text-left">Insurance</th>
          <th className="p-3 text-left">Stage</th>
          <th className="p-3 text-left">Last Update</th>
          <th className="p-3 text-center">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-border-color">
        {orders.length === 0 ? (
          <tr>
            <td colSpan={6} className="text-center py-12 px-6 text-gray-500">
              <p className="font-semibold">No Referrals Found</p>
              <p className="text-sm mt-1">No records match the current filters.</p>
            </td>
          </tr>
        ) : (
          Object.keys(groupedOrders).sort().map(letter => (
            <React.Fragment key={letter}>
              <tr className="sticky top-[34px] z-10">
                <td colSpan={6} className="bg-gray-100 dark:bg-gray-900/80 backdrop-blur-sm px-3 py-1 font-bold text-sm uppercase text-muted">
                  {letter}
                </td>
              </tr>
              {groupedOrders[letter].map((order) => (
                <tr key={order.id} onClick={() => onViewDetails(order)} className={cn("hover:bg-emerald-50/40 dark:hover:bg-emerald-900/20 transition-colors cursor-pointer", selectedOrderIds.includes(order.id) && "bg-teal-50 dark:bg-teal-900/50")}>
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      label=""
                      checked={selectedOrderIds.includes(order.id)}
                      onChange={() => onToggleSelection(order.id)}
                    />
                  </td>
                  <td className="p-3 font-medium text-gray-900 dark:text-gray-200">
                    <div className="flex items-center gap-2">
                       <StoplightStatusControl
                            orderId={order.id}
                            patientId={order.patient_id}
                            currentStatus={order.stoplight_status}
                            onUpdate={onUpdate}
                            showLabel={false}
                        />
                        <span dangerouslySetInnerHTML={{ __html: highlight(order.patients?.name || order.patient_name || 'Unknown', term) }} />
                    </div>
                  </td>
                  <td className="p-3 text-gray-500 dark:text-gray-400">{order.patients?.primary_insurance || 'N/A'}</td>
                  <td className="p-3 text-gray-500 dark:text-gray-400">{order.workflow_stage}</td>
                  <td className="p-3 text-gray-500 dark:text-gray-400">{order.last_stage_change ? new Date(order.last_stage_change).toLocaleDateString() : 'N/A'}</td>
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Btn variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                            </Btn>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onViewDetails(order)}><Eye className="h-4 w-4 mr-2"/>View Details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onStageChangeClick(order)}><Edit className="h-4 w-4 mr-2"/>Change Stage</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onExportSnapshot(order)} disabled={exportingSnapshotId === order.id}>
                                {exportingSnapshotId === order.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                                {exportingSnapshotId === order.id ? 'Generating...' : 'Export Snapshot'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onArchiveToggle(order)} className={order.is_archived ? "text-blue-600" : "text-amber-600"}>
                                {order.is_archived ? <RotateCcw className="h-4 w-4 mr-2"/> : <Archive className="h-4 w-4 mr-2"/>}
                                {order.is_archived ? 'Restore' : 'Archive'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(order)} className="text-red-600 dark:text-error">
                                <Trash2 className="h-4 w-4 mr-2"/>
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))
        )}
      </tbody>
    </table>
  );
};

export default ReferralTable;
