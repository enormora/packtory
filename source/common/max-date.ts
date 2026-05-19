export function maxDate(firstDate: Date, otherDates: readonly Date[]): Date {
    return otherDates.reduce((currentMax, date) => {
        return date.getTime() > currentMax.getTime() ? date : currentMax;
    }, firstDate);
}
