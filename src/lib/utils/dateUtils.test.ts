import { describe, it, expect } from 'vitest';
import { getPreviousPeriod } from './dateUtils';

describe('dateUtils', () => {
    describe('getPreviousPeriod', () => {
        it('should return previous month in same year', () => {
            expect(getPreviousPeriod('2023-05')).toBe('2023-04');
        });

        it('should return previous month across year boundary', () => {
            expect(getPreviousPeriod('2023-01')).toBe('2022-12');
        });

        it('should handle leap years correctly', () => {
            // 2024 is a leap year. 2024-03 -> 2024-02
            expect(getPreviousPeriod('2024-03')).toBe('2024-02');
        });
    });
});
