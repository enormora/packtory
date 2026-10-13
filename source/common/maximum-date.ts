export function maximumDate(firstDate: Date, otherDates: readonly Date[]): Date {
    return otherDates.reduce(function (currentMaximum, date) {
        return date.getTime() > currentMaximum.getTime() ? date : currentMaximum;
    }, firstDate);
}
