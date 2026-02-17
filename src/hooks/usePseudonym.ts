import { useDashboard } from '../lib/context/DashboardContext';

export const usePseudonym = () => {
    const { isPrivacyMode } = useDashboard();

    const mask = (value: string | null | undefined, type: 'vendor' | 'person' | 'email' = 'vendor'): string => {
        if (!value) return '';
        if (!isPrivacyMode) return value;

        // Simple deterministic hashing for consistent pseudonyms
        // In a real app, this would use a proper seed or lookup table
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }

        const positiveHash = Math.abs(hash);
        const suffix = positiveHash.toString(36).substring(0, 4).toUpperCase();

        switch (type) {
            case 'vendor':
                return `Vendor ${suffix}`;
            case 'person':
                return `User ${suffix}`;
            case 'email':
                return `user.${suffix}@company.com`;
            default:
                return `*****`;
        }
    };

    return { isPrivacyMode, mask };
};
