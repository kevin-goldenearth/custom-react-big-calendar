// main entry point for the widget; all props will come in from here.
import classnames from "classnames";
import { ReactElement, createElement, useEffect, useMemo } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { CalendarContainerProps } from "../typings/CalendarProps";
import { format, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';  
import * as dateFns from "date-fns";


// // Define calendar event attribute enum types
// enum CalEventType {
//     All = "All",
//     Overnight = "Overnight",
//     Transit = "Transit",
//     Timeslot = "Timeslot",
//     Activity = "Activity",
//     Competition = "Competition"
// }

// // Set default persistent calendar event attribute
// const DEFAULT_CALENDAR_EVENT_TYPE = CalEventType.All

// Define the CalEvent
interface CalEvent {
    description: string;
    start: Date;
    end: Date;
    allDay: boolean;
    display: string;
    // optional: 
    icons?: string[];
    fontColor?: string;
    backgroundColor?: string;
    header?: string;
    type?: string;
}

// Function for building a custom week event
const CustomWeekEvent = ({ event }: { event: CalEvent }) => {
     const { header, allDay, description } = event;
    return allDay ? (
        <div className={`allDay-event`}>
            <p>{header}</p>
            <strong>{description}</strong>
        </div>
    ) : (
        <div className={`timed-event`}>
            <p>{header}</p>
            <strong>{description}</strong>
        </div>
    );
};

interface CustomMonthEventProps {
    event: CalEvent & { icons?: string[] };
    onShowMoreClick?: (date: Date) => void;

}

// Event content is customized based on icons or eventInfo display  
const CustomMonthEvent = ({ event, onShowMoreClick }: CustomMonthEventProps) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPast = event.end < today;
    const dimClass = isPast ? "rbc-day-dimmed" : "";
    if (event.display === "icons" && event.icons && event.icons.length > 0) {
        const maxToShow = 3;
        const visible = event.icons.slice(0, maxToShow);
        const hiddenCount = event.icons.length - visible.length;

        return (
            <div className={`icon-row ${dimClass}`}>
                <div className="circle-row">
                    {visible.map((color, i) => (
                        <span
                            key={i}
                            className="color-circle"
                            style={{ backgroundColor: color }}
                            title={color}
                        />
                    ))}
                </div>

                {hiddenCount > 0 && (
                    <div className="show-more-row">
                        <span
                            className="show-more"
                            title={`+${hiddenCount} more`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onShowMoreClick?.(event.start);
                            }}
                        >
                            +{hiddenCount}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    if (event.display === "eventinfo") {
        return (
            <div className={`event-info ${dimClass}`}>
                <p>{event.header}</p>
                <strong>{event.description}</strong>
            </div>
        );
    }

    return null;
};

function groupIconEventsByDay(events: CalEvent[], view: string): CalEvent[] {
    if (view !== "month") return events;

    const groupedMap = new Map<string, CalEvent>();
    const result: CalEvent[] = [];

    for (const event of events) {
        if (event.display === "eventinfo") {
            // Keep regular event info events ungrouped
            result.push(event);
            continue;
        }

        if (event.display === "icons") {
            const dayKey = event.start.toDateString();

            if (!groupedMap.has(dayKey)) {
                groupedMap.set(dayKey, {
                    ...event,
                    display: "icons",
                    description: "",            // suppress description
                    icons: [event.fontColor || "#999"], // custom field for grouped icons
                });
            } else {
                const grouped = groupedMap.get(dayKey)!;
                (grouped.icons ||= []).push(event.fontColor || "#999");
            }
        }
    }

    return [...result, ...groupedMap.values()];
}

const localizer = dateFnsLocalizer({
    format: dateFns.format,
    parse: dateFns.parse,
    startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // make week view start on monday instead of sunday 
    getDay: dateFns.getDay,
    locales: {}
});

// icons need to show on each day of a multiday event 
function expandMultiDayEvents(events: CalEvent[], view: string): CalEvent[] {
    const expandedEvents: CalEvent[] = [];
    
    events.forEach(event => {
        const startDate = new Date(event.start);
        const endDate = new Date(event.end);

        const isMultiDay = startDate.toDateString() !== endDate.toDateString();
        const shouldChunk = event.display === "icons" && view === "month";

        // chunk events that are more than 1 day when display is icons
        if (isMultiDay && shouldChunk) {
            let currentDate = new Date(startDate);

            while (currentDate < endDate) {
                const chunkStart = new Date(currentDate);
                chunkStart.setHours(0, 0, 0, 0); // time doesn't matter since multi-day events are shown in all day section and this will not change the displayed time 

                const chunkEnd = new Date(currentDate);
                chunkEnd.setHours(23, 59, 59, 999); // time doesn't matter since multi-day events are shown in all day section and this will not change the displayed time 

                expandedEvents.push({
                    ...event,
                    start: chunkStart,
                    end: chunkEnd,
                });

                currentDate.setDate(currentDate.getDate() + 1);
            }
        } else {
            // if single-day events or if display is EventInfo then don't chunk  
            expandedEvents.push(event);
        }
    });

    return expandedEvents;
}

// Helper to map Mendix objects to CalEvents
function mapCalendarEvents(props: CalendarContainerProps): CalEvent[] {
    if (!props || !Array.isArray(props)) return [];

    const items = props.databaseDataSource?.items ?? [];
    if (items.length === 0) return [];

    // Map each item to a CalEvent
    return  items.map(item => {
        const header =
            props.header === "attribute" && props.headerAttribute
                ? (props.headerAttribute.get(item).value ?? "")
                : props.header === "expression" && props.headerExpression
                  ? (props.headerExpression.get(item).value ?? "")
                  : "";

        const description =
            props.description === "attribute" && props.descriptionAttribute
                ? (props.descriptionAttribute.get(item).value ?? "")
                : props.description === "expression" && props.descriptionExpression
                  ? (props.descriptionExpression.get(item).value ?? "")
                  : "";

        const start = props.startAttribute?.get(item).value ?? new Date();
        const end = props.endAttribute?.get(item).value ?? start;
        const allDay = props.allDayAttribute?.get(item).value ?? false;
        const fontColor = props.eventFontColor?.get(item).value;
        const backgroundColor = props.eventBackgroundColor?.get(item).value;
        const rawdisplay = props.displayType?.value;
        const display = rawdisplay ? rawdisplay.toString().toLowerCase() : "";
        const type = props.eventTypeAttribute?.get(item)?.value ?? "";

        return { description, start, end, fontColor, backgroundColor, allDay, display, header, type }; 
    });
}

// // Helper function to determine if a date is within the selected quarter range
// function isInQuarter(args: { props: CalendarContainerProps, date: Date }): boolean {
//     const rawQuarterStart = args.props.quarterStart?.value ?? new Date();
//     const rawQuarterEnd = args.props.quarterEnd?.value ?? new Date();

//     const quarterStart = startOfMonth(rawQuarterStart);
//     const quarterEnd = endOfMonth(rawQuarterEnd);

//     return args.date >= quarterStart && args.date <= quarterEnd;
// }


// let calendarPropsRef: React.RefObject<CalendarContainerProps>;


// // Wrapper component to hide dates outside the quarter range
// function customDateCellWrapper(wrapperProps: any ): ReactElement {
//     const props = calendarPropsRef?.current
//     const { children, value } = wrapperProps;

//     if (!isInQuarter({ props: wrapperProps, date: value })) {
//         return <div style={{ visibility: "hidden", height: "100%" }}>{children}</div>;
//     }

//     return children;
// };



// Helper function to style events based on view and event properties
function eventPropGetter(args: { currentView: string, event: CalEvent }): { style: React.CSSProperties } {
    const shouldApplyBackground = args.currentView === "week" ||
        (args.currentView === "month" && args.event.display === "eventinfo");

    return {
        style: {
            backgroundColor: shouldApplyBackground ? args.event.backgroundColor : "transparent",
            color: args.event.fontColor
        }
    };
};

// Helper function to build a map of flags for quick lookup
function mapFlagList(props: CalendarContainerProps): Map<string, string> {
    const flagList = props.flags?.items ?? [];
    const flagMap = new Map<string, string>();

    for (const item of flagList) {
        const date = props.flagDateAttribute?.get(item)?.value;
        const name = props.flagNameAttribute?.get(item)?.value;
        if (date && name) {
            const dayKey = date.toDateString();
            flagMap.set(dayKey, name ?? "default-flag");
        }
    }

    return flagMap;
}

// // Helper function to handle "show more" clicks
// function onShowMore(args: {
//         props: CalendarContainerProps,
//         _events: CalEvent[],
//         date: Date
//     }): false {

//     if (args.props.clickedDate?.setValue) {
//         args.props.clickedDate.setValue(args.date);
//     }

//     if (args.props.onClickShowMore?.canExecute) {
//         args.props.onClickShowMore.execute();
//     }

//     if (args.props.viewAttribute?.setValue) {
//         args.props.viewAttribute.setValue("month");
//     }

//     return false;
// }


// The main widget component
export default function MxCalendar(props: CalendarContainerProps): ReactElement {
    const { class: className } = props;

    // currentView will be "month" if "quarter" is selected 
    const rawView = props.viewAttribute?.value ?? props.defaultView;
    const currentView = rawView === "quarter" ? "month" : rawView;

    const rawEvents: CalEvent[] = mapCalendarEvents(props);

    const expanded = expandMultiDayEvents(rawEvents, currentView);
    const events = groupIconEventsByDay(expanded, currentView);

    const viewsOption = ["month", "week", "quarter"] as const;

    // formats 
    const formats = useMemo(() => ({
        // month view; 1 letter to represent day of the week in column headers 
        weekdayFormat: (
            date: Date,
            culture: string | undefined,
            localizer: ReturnType<typeof dateFnsLocalizer>
        ) => localizer.format(date, "EEEEE", culture),

        // format for the number representing the day of the month for each cell in month view 
        dateFormat: (
            date: Date,
            culture: string | undefined,
            localizer: ReturnType<typeof dateFnsLocalizer>
        ) => localizer.format(date, 'd', culture),

        timeGutterFormat: (
            date: Date,
            culture: string | undefined,
            localizer: ReturnType<typeof dateFnsLocalizer>
        ) => localizer.format(date, "HH:mm", culture), // 24-hour format, no AM/PM 
    }), []);

    // get the selected dates list 
    const selectedDates = (props.datesSelected?.items ?? [])
        .map(item => {
            const value = props.selectedDateAttr?.get(item)?.value;
            return value ? new Date(value.setHours(0, 0, 0, 0)) : null;
        })
        .filter((date): date is Date => !!date);

    // Build a map of name and day 
    const flagMap = mapFlagList(props);
    
    const rawQuarterStart = props.quarterStart?.value ?? new Date();
    const rawQuarterEnd = props.quarterEnd?.value ?? new Date();

    const quarterStart = startOfMonth(rawQuarterStart);
    const quarterEnd = endOfMonth(rawQuarterEnd);

    const isInQuarter = (date: Date): boolean =>
        date >= quarterStart && date <= quarterEnd;

    // Renders custom week header with flags and today highlight
    const CustomWeekHeader = ({ date }: { date: Date }) => {
        const dayLetter = format(date, 'EEEEE'); // first letter of the weekday, ie. "M"
        const dayNumber = format(date, 'd');     // day of the month, ie. "3"

        // Normalize input date
        const normalizedDate = new Date(date);
        normalizedDate.setHours(0, 0, 0, 0);

        // Normalize today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const isToday = normalizedDate.getTime() === today.getTime();

        const dayKey = normalizedDate.toDateString();
        const flagClass = flagMap.get(dayKey);

        const className = [
            "custom-week-header",
            flagClass
        ]
            .filter(Boolean)
            .join(" ");

        return (
            <div className={className}>
                {isToday ? (
                    <span className="week-today-inner">
                        <div className="custom-week-header-letter">{dayLetter}</div>
                        <div className="custom-week-header-number">{dayNumber}</div>
                    </span>
                ) : (
                    <span>
                        <div className="custom-week-header-letter">{dayLetter}</div>
                        <div className="custom-week-header-number">{dayNumber}</div>
                    </span>
                )}
            </div>
        );
    };

    // Renders custom month date header with flags and today/selected highlight
    const CustomMonthDateHeader = ({ label, date }: { label: string, date: Date }) => {

        if (!isInQuarter(date)) {
            return null; // Hide header for days outside the quarter
        }

        // Normalize input date
        const normalizedDate = new Date(date);
        normalizedDate.setHours(0, 0, 0, 0);

        // Normalize today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const isToday = normalizedDate.getTime() === today.getTime();

        const isSelected = selectedDates.some(
            selected => selected.getTime() === normalizedDate.getTime()
        );
        const isPast = normalizedDate < new Date(new Date().setHours(0,0,0,0));

        const dayKey = normalizedDate.toDateString();
        const flagClass = flagMap.get(dayKey);

        const className = [
            "rbc-date-cell",
            flagClass,
            isSelected ? "selected" : "",
            isPast ? "rbc-day-dimmed" : ""
        ]
            .filter(Boolean)
            .join(" ");

        return (
            <div className={className}>
                {isToday ? (
                    <span className="month-today-inner">{label}</span>
                ) : (
                    label
                )}
            </div>
        );
    };

    const customDateCellWrapper = (props: any) => {
        const { children, value } = props;

        if (!isInQuarter(value)) {
            return <div style={{ visibility: "hidden", height: "100%" }}>{children}</div>;
        }

        return children;
    };

    const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
        if (!isInQuarter(slotInfo.start)) {
            return; // Ignore clicks outside quarter
        }

        // Set clicked date attribute in Mendix 
        if (props.clickedDate && props.clickedDate.setValue) {
            props.clickedDate.setValue(slotInfo.start); 
        }

        // Execute the onClickEmpty action
        if (props.onClickEmpty && props.onClickEmpty.canExecute) {
            props.onClickEmpty.execute();
        }
    };

    const handleSelectEvent = (event: CalEvent) => {
        if (!isInQuarter(event.start)) {
            return; // Ignore events outside quarter
        }

        // Set clicked date attribute in Mendix
        if (props.clickedDate && props.clickedDate.setValue) {
            props.clickedDate.setValue(event.start); 
        }

        // Execute the onClickEvent action
        if (props.onClickEvent && props.onClickEvent.canExecute) {
            props.onClickEvent.execute();
        }
    };

    // messages  
    const messages = useMemo(() => ({
        showMore: (total: number) => `+${total}`
    }), []);

    function onShowMore(_events: CalEvent[], date: Date): false {
        if (props.clickedDate?.setValue) {
            props.clickedDate.setValue(date);
        }

        if (props.onClickShowMore?.canExecute) {
            props.onClickShowMore.execute();
        }

        if (props.viewAttribute?.setValue) {
            props.viewAttribute.setValue("month");
        }

        return false;
    }

    useEffect(() => {
        const handler = (e: any) => {
            const date = e.detail?.date;
            if (!date) return;
            onShowMore([], date);
        };
        window.addEventListener("customShowMore", handler);
        return () => window.removeEventListener("customShowMore", handler);
    }, []);
  
    return (
        <div className={classnames(className)}>
            <Calendar<CalEvent>
                localizer={localizer}
                views={viewsOption}
                view={currentView ?? props.defaultView}
                startAccessor={(event: CalEvent) => event.start}
                endAccessor={(event: CalEvent) => event.end}
                allDayAccessor={(event: CalEvent) => event.allDay}
                events={events}
                eventPropGetter={eventPropGetter}
                components={{
                    week: {
                        header: CustomWeekHeader,
                        event: CustomWeekEvent
                    },
                    dateHeader: ({ label, date }: { label: string, date: Date }) => (
                        CustomMonthDateHeader({ label, date })
                    ),
                    month: {
                        event: (calendarEventProps: { event: CalEvent }) => (
                        <CustomMonthEvent
                            {...calendarEventProps}
                            onShowMoreClick={(date) => onShowMore([], date)}     
                        />
                        )
                    },
                    dateCellWrapper: customDateCellWrapper, 
                }}
                formats={formats}
                toolbar={false}
                date={props.dateExpression?.value ?? new Date()}
                onView={(newView: "month" | "week" | "quarter") => {
                    props.viewAttribute?.setValue?.(newView);
                }}
                onNavigate={(newDate: Date) => {
                    if ("setValue" in (props.dateExpression ?? {})) {
                        // @ts-expect-error: setValue may exist on runtime Mendix object
                        props.dateExpression.setValue(newDate);
                    }
                }}
                selectable={true}
                onSelectSlot={handleSelectSlot} // empty space on calendar 
                onSelectEvent={handleSelectEvent}
                showMultiDayTimes={true}
                // timeslots={1} // number of slots per "section" in the time grid views
                // step={4} // selectable time increments 
                messages={messages}
                onShowMore={onShowMore}
                popup={false}
                drilldownView={null}
                dayLayoutAlgorithm="no-overlap"
                // scrollToTime={new Date(1970, 1, 1, 6, 0, 0)} // Scroll to 6am, the date does not matter here, just need a date with the time that you want 
            />
        </div>
    );
}


