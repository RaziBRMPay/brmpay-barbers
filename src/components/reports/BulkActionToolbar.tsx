import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  Trash2, 
  X,
  Archive
} from 'lucide-react';

interface BulkActionToolbarProps {
  selectedCount: number;
  onDownloadSelected: () => void;
  onClearSelection: () => void;
  onDeleteSelected?: () => void;
  onArchiveSelected?: () => void;
  disabled?: boolean;
}

export const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
  selectedCount,
  onDownloadSelected,
  onClearSelection,
  onDeleteSelected,
  onArchiveSelected,
  disabled = false
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg p-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Badge variant="default" className="bg-primary">
          {selectedCount} selected
        </Badge>
        <span className="text-sm text-muted-foreground">
          {selectedCount === 1 ? '1 report selected' : `${selectedCount} reports selected`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDownloadSelected}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download All
        </Button>

        {onArchiveSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onArchiveSelected}
            disabled={disabled}
            className="flex items-center gap-2"
          >
            <Archive className="h-4 w-4" />
            Archive
          </Button>
        )}

        {onDeleteSelected && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDeleteSelected}
            disabled={disabled}
            className="flex items-center gap-2 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="flex items-center gap-1"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  );
};