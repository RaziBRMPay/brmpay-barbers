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
              "justify-start text-left font-normal min-w-[320px] h-12 px-4 border-2 hover:border-primary/20 transition-all duration-200",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
            <div className="flex flex-col items-start">
              <span className="font-medium">{getDisplayText()}</span>
              {getTimeDisplay() && (
                <span className="text-xs text-muted-foreground mt-0.5">
                  {getTimeDisplay()}
                </span>
              )}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 shadow-lg border-2" align="start">
          <div className="p-6 border-b bg-gradient-to-r from-background to-muted/20">
            <h4 className="font-semibold text-base mb-4 text-foreground">Quick Select</h4>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={selectToday}
                className="h-10 bg-background hover:bg-primary hover:text-primary-foreground transition-all duration-200 border border-border hover:border-primary font-medium"
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectYesterday}
                className="h-10 bg-background hover:bg-primary hover:text-primary-foreground transition-all duration-200 border border-border hover:border-primary font-medium"
              >
                Yesterday
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={selectThisMonth}
                className="h-10 bg-background hover:bg-primary hover:text-primary-foreground transition-all duration-200 border border-border hover:border-primary font-medium"
              >
                This Month
              </Button>
            </div>
          </div>
          
          <div className="p-4">
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
              className="pointer-events-auto rounded-lg"
            />
          </div>
          
          {getTimeDisplay() && (
            <div className="p-4 border-t bg-gradient-to-r from-muted/30 to-muted/10 rounded-b-lg">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2 text-primary">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Time Range</span>
                </div>
                <span className="text-foreground font-mono bg-background px-2 py-1 rounded border">
                  {getTimeDisplay()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <span className="w-1 h-1 bg-primary rounded-full"></span>
                Report cycle starts at {reportCycleTime} daily
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}