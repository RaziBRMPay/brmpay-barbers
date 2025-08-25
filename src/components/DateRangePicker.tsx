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

    // Validate date range
    if (adjustedRange.from && adjustedRange.to && adjustedRange.from > adjustedRange.to) {
      console.warn('Invalid date range: start date is after end date');
      return;
    }

    onDateRangeChange(adjustedRange);
  };

  // Preset: Today
  const selectToday = () => {
    const now = new Date();
    const todayReportCycle = applyReportCycleTime(new Date());
    
    let startOfRange: Date;
    
    // If current time is after today's report cycle time, use today's cycle
    // If current time is before today's report cycle time, use yesterday's cycle
    if (now >= todayReportCycle) {
      startOfRange = todayReportCycle;
    } else {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startOfRange = applyReportCycleTime(yesterday);
    }
    
    // Validate that start is not after end
    if (startOfRange > now) {
      console.warn('Invalid date range: start date is after end date');
      return;
    }

    onDateRangeChange({
      from: startOfRange,
      to: now
    });
    setIsOpen(false);
  };

  // Preset: Yesterday
  const selectYesterday = () => {
    const now = new Date();
    const todayReportCycle = applyReportCycleTime(new Date());
    
    let startOfRange: Date;
    let endOfRange: Date;
    
    // If current time is after today's report cycle time, yesterday = yesterday's cycle to today's cycle
    // If current time is before today's report cycle time, yesterday = day before yesterday's cycle to yesterday's cycle
    if (now >= todayReportCycle) {
      // Today's cycle has started, so yesterday = yesterday's cycle to today's cycle
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startOfRange = applyReportCycleTime(yesterday);
      endOfRange = todayReportCycle;
    } else {
      // Today's cycle hasn't started yet, so yesterday = day before yesterday's cycle to yesterday's cycle
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBeforeYesterday = new Date(now);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      
      startOfRange = applyReportCycleTime(dayBeforeYesterday);
      endOfRange = applyReportCycleTime(yesterday);
    }
    
    // Validate that start is not after end
    if (startOfRange > endOfRange) {
      console.warn('Invalid date range: start date is after end date');
      return;
    }

    onDateRangeChange({
      from: startOfRange,
      to: endOfRange
    });
    setIsOpen(false);
  };

  // Preset: This Month
  const selectThisMonth = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Start of month at report cycle time
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const startOfRange = applyReportCycleTime(startOfMonth);
    
    // Current time as end
    const endOfRange = now;
    
    // Validate that start is not after end
    if (startOfRange > endOfRange) {
      console.warn('Invalid date range: start date is after end date');
      return;
    }

    onDateRangeChange({
      from: startOfRange,
      to: endOfRange
    });
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
              <Button
                variant="outline"
                size="sm"
                onClick={selectThisMonth}
                className="flex-1"
              >
                This Month
              </Button>
            </div>
          </div>
          
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from || new Date()}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            captionLayout="dropdown"
            fromYear={2020}
            toYear={2030}
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