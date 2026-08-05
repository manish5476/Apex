export class DateUtils {
    static startOfDay(date: Date | string): Date {
        const d = new Date(date);
        d.setUTCHours(0, 0, 0, 0);
        return d;
    }

    static endOfDay(date: Date | string): Date {
        const d = new Date(date);
        d.setUTCHours(23, 59, 59, 999);
        return d;
    }

    static dateRangeQuery(from: string | Date, to: string | Date): { $gte: Date; $lte: Date } {
        return {
            $gte: this.startOfDay(from),
            $lte: this.endOfDay(to),
        };
    }

    static parseQueryDate(dateStr?: string | null): Date | null {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }

    static isValidDateRange(from: Date, to: Date): boolean {
        return from <= to;
    }

    static getPeriodDates(
        period: string,
        startDate?: string | Date,
        endDate?: string | Date
    ): { start: Date; end: Date } {
        const now = new Date();
        let start: Date, end: Date;

        switch (period) {
            case 'today':
                start = new Date(now.setHours(0, 0, 0, 0));
                end = new Date();
                break;
            case 'yesterday':
                start = new Date(now);
                start.setDate(now.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_week':
                const day = now.getDay();
                start = new Date(now.setDate(now.getDate() - day + (day === 0 ? -6 : 1)));
                start.setHours(0, 0, 0, 0);
                end = new Date();
                break;
            case 'this_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date();
                break;
            case 'last_month':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                break;
            case 'custom':
                start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
                end = endDate ? new Date(endDate) : new Date();
                break;
            default:
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date();
        }
        return { start, end };
    }
    static getFinancialYear(date: Date = new Date()): string {
        const year = date.getFullYear();
        const month = date.getMonth();
        return month >= 3 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
    }

    static getFinancialYearDates(financialYear: string): { startDate: Date; endDate: Date } {
        const [startYear, endYear]: any = financialYear.split('-').map(Number);
        return {
            startDate: new Date(startYear, 3, 1),
            endDate: new Date(endYear, 2, 31, 23, 59, 59),
        };
    }
}