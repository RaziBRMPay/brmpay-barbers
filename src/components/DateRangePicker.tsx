import React, { useState, useEffect } from 'react';
import { format, addDays, subDays, setHours, setMinutes, setSeconds } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  reportCycleTime: string; // Format: "06:00:00"
  lastCompletedReportCycleTime?: Date; // Optional timestamp
  className?: string;
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  reportCycleTime,
  lastCompletedReportCycleTime,
  className
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Parse report cycle time (e.g., "06:00:00" -> 6 hours)
  const parseReportCycleTime = (timeString: string) => {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    return { hours, minutes, seconds };
  };

  // Apply report cycle time to a date
  const applyReportCycleTime = (date: Date) => {
    const { hours, minutes, seconds } = parseReportCycleTime(reportCycleTime);
    return setSeconds(setMinutes(setHours(date, hours), minutes), seconds);
  };

  // Handle calendar date selection
  const handleDateSelect = (range: DateRange | undefined) => {
    if (!range) {
      onDateRangeChange(undefined);
      return;
    }

    let adjustedRange: DateRange = { from: undefined, to: undefined };

    // Apply report cycle time to start date
    if (range.from) {
      adjustedRange.from = applyReportCycleTime(range.from);
    }

    // Apply report cycle time to end date
    if (range.to) {
      adjustedRange.to = applyReportCycleTime(range.to);
    }

    onDateRangeChange(adjustedRange);
  };

  // Preset: Today
  const selectToday = () => {
    const today = new Date();
    const startOfCycle = applyReportCycleTime(today);
    const now = new Date();

    onDateRangeChange({
      from: startOfCycle,
      to: now
    });
    setIsOpen(false);
  };

  // Preset: Yesterday
  const selectYesterday = () => {
    if (!lastCompletedReportCycleTime) {
      // Fallback if no last completed cycle time
      const yesterday = subDays(new Date(), 1);
      const startOfCycle = applyReportCycleTime(yesterday);
      const endOfCycle = applyReportCycleTime(new Date());

      onDateRangeChange({
        from: startOfCycle,
        to: endOfCycle
      });
    } else {
      // Use exact 24-hour period ending at last completed cycle
      const endTime = lastCompletedReportCycleTime;
      const startTime = subDays(endTime, 1);

      onDateRangeChange({
        from: startTime,
        to: endTime
      });
    }
    setIsOpen(false);
  };

  // Format display text
  const getDisplayText = () => {
    if (!dateRange?.from) return "Pick a date range";

    if (dateRange.to) {
      return `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`;
    }

    return format(dateRange.from, "MMM dd, yyyy");
  };

  // Get time display for selected range
  const getTimeDisplay = () => {
    if (!dateRange?.from) return null;

    const fromTime = format(dateRange.from, "HH:mm:ss");
    const toTime = dateRange.to ? format(dateRange.to, "HH:mm:ss") : "now";

    return `${fromTime} → ${toTime}`;
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-left font-normal min-w-[280px]",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {getDisplayText()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-4 border-b space-y-2">
            <h4 className="font-medium text-sm">Quick Select</h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectToday}
                className="flex-1"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={selectYesterday}
                className="flex-1"
              >
                Yesterday
              </Button>
            </div>
          </div>
          
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            className="pointer-events-auto"
          />
          
          {getTimeDisplay() && (
            <div className="p-4 border-t bg-muted/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Time range: {getTimeDisplay()}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on report cycle time: {reportCycleTime}
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}