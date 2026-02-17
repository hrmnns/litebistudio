import type { InvoiceItem } from '../../types';

/**
 * Determines the best key fields to use for tracking an invoice item's history.
 * Prioritizes stable identifiers (PO, Contract) over mutable ones (DocumentId).
 */
export function getSmartKeyFields(item: InvoiceItem | null | undefined): string[] {
    if (!item) return ['DocumentId', 'LineId'];

    // 1. User-defined overrides (highest priority)
    try {
        const savedMappings = JSON.parse(localStorage.getItem('excel_mappings_v2') || '{}');
        const firstMappingWithKeys = Object.values(savedMappings as Record<string, Record<string, unknown>>).find(m => m.__keyFields);
        if (firstMappingWithKeys?.__keyFields) {
            const keys = firstMappingWithKeys.__keyFields as string[];
            // FIX: Ignore legacy default if it's just DocumentId+LineId, matching smart logic takes precedence
            const isLegacyDefault = keys.length === 2 && keys.includes('DocumentId') && keys.includes('LineId');

            if (!isLegacyDefault) {
                return keys;
            }
        }
    } catch (e) {
        console.warn('Failed to parse custom mappings', e);
    }

    // 2. Smart Defaults based on available data

    // Priority A: Purchase Order (User requested for recurring costs)
    if (item.POId) {
        return ['POId', 'LineId'];
    }

    // Priority B: Contract Match
    if (item.ContractId) {
        return ['ContractId', 'LineId'];
    }

    // Priority C: Stable Vendor Identity
    if (item.VendorId) {
        return ['VendorId', 'LineId'];
    }

    // Priority D: Functional Fallback (Ad-Hoc)
    // Exclude DocumentId as it changes monthly
    return ['VendorName', 'Description'];
}
