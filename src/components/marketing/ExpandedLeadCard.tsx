import React from 'react';
import { motion } from 'framer-motion';
import { toast } from '@/lib/toast';
import { Copy, X, Building, Hospital, Stethoscope, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MarketingLead } from '@/lib/types';

const typeConfig = {
    Clinic: { icon: Stethoscope },
    Hospital: { icon: Hospital },
    SNF: { icon: Building },
    PCP: { icon: Stethoscope },
    DME: { icon: Handshake },
    Other: { icon: Building },
};

const statusConfig = {
    Prospect: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Warm: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    Active: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    Dormant: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Lost: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
};

interface ExpandedLeadCardProps {
    lead: MarketingLead;
    onCollapse: () => void;
}

const ExpandedLeadCard: React.FC<ExpandedLeadCardProps> = ({ lead, onCollapse }) => {
    const TypeIcon = (typeConfig[lead.type as keyof typeof typeConfig] || { icon: Building }).icon;
    const statusColor = statusConfig[lead.lead_status as keyof typeof statusConfig] || statusConfig.Prospect;

    const handleCopy = (text: string, field: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast(`${field} copied to clipboard!`, 'ok');
        });
    };

    return (
        <motion.div
            layoutId={`lead-card-${lead.id}`}
            className="soft-card w-full max-w-md bg-surface dark:bg-zinc-900 rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-4 border-b border-border-color flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <div className="bg-pc-blue-50 dark:bg-pc-blue-700/20 p-2 rounded-lg">
                        <TypeIcon className="h-6 w-6 text-pc-blue-700 dark:text-pc-blue-500" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text">{lead.name}</h2>
                        <p className="text-sm text-muted">{lead.type}</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onCollapse} className="-mr-2 -mt-2">
                    <X className="h-5 w-5" />
                </Button>
            </div>

            <div className="p-4 space-y-4">
                <div className={cn("px-3 py-1 rounded-full font-semibold text-sm inline-block", statusColor)}>
                    {lead.lead_status || 'Prospect'}
                </div>

                {lead.phone && (
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted">Phone</p>
                            <p className="font-mono text-lg text-text">{lead.phone}{lead.phone_extension ? ` x${lead.phone_extension}` : ''}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleCopy(lead.phone!, 'Phone')}>
                            <Copy className="h-4 w-4 mr-2" /> Copy
                        </Button>
                    </div>
                )}

                {lead.full_address && (
                    <div className="flex items-center justify-between">
                        <div className="min-w-0">
                            <p className="text-xs text-muted">Address</p>
                            <p className="text-base text-text truncate">{lead.full_address}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleCopy(lead.full_address!, 'Address')} className="ml-2 flex-shrink-0">
                            <Copy className="h-4 w-4 mr-2" /> Copy
                        </Button>
                    </div>
                )}
                
                {lead.notes && (
                    <div>
                        <p className="text-xs text-muted mb-1">Notes</p>
                        <p className="text-sm text-muted bg-gray-50 dark:bg-zinc-800/50 p-3 rounded-lg border dark:border-zinc-800">
                            {lead.notes}
                        </p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default ExpandedLeadCard;
