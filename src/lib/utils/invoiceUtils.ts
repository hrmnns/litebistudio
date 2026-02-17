import type { InvoiceItem } from '../../types';

/**
 * Determines the best key fields to use for tracking an invoice item's history.
 * Prioritizes stable identifiers (PO, Contract) over mutable ones (DocumentId).
 */
export function getSmartKeyFields(item: InvoiceItem | null | undefined): string[] {
    if (!item) return ['DocumentId', 'LineId'];

    // --- STRATEGIC PRIORITY 1: Strict ERP Identity (Always wins) ---
    // If we have a PO or Contract, we ignore all other settings/mappings 
    // because this is the only reliable way to track procurement lifecycle.
    if (item.POId && item.LineId !== undefined) {
        return ['POId', 'LineId'];
    }

    if (item.ContractId && item.LineId !== undefined) {
        return ['ContractId', 'LineId'];
    }

    // --- STRATEGIC PRIORITY 2: User-defined overrides ---
    try {
        const savedMappings = JSON.parse(localStorage.getItem('excel_mappings_v2') || '{}');
        const firstMappingWithKeys = Object.values(savedMappings as Record<string, Record<string, unknown>>).find(m => m.__keyFields);
        if (firstMappingWithKeys?.__keyFields) {
            const keys = firstMappingWithKeys.__keyFields as string[];
            return keys;
        }
    } catch (e) {
        console.warn('Failed to parse custom mappings', e);
    }

    // 2. Smart Defaults based on available data

    // Rule A: Purchase Order (Strict match for ERP systems)
    if (item.POId && item.LineId !== undefined) {
        return ['POId', 'LineId'];
    }

    // Rule B: Contract (Strict match for recurring service contracts)
    if (item.ContractId && item.LineId !== undefined) {
        return ['ContractId', 'LineId'];
    }

    // Fallback: Composite Key based on business attributes
    const keys: string[] = [];

    // Base Identifier
    if (item.VendorId) {
        keys.push('VendorId');
    } else {
        keys.push('VendorName');
    }

    // Content Context
    if (item.POId || item.ContractId || item.VendorId) {
        // We have some ID, so we trust LineId as relative pointer
        keys.push('LineId');
    } else {
        // No IDs at all, use descriptive content
        if (item.Service) keys.push('Service');
        if (item.Description) keys.push('Description');
    }

    // Context / Accounting context (As a separator for generic items)
    if (item.CostCenter) keys.push('CostCenter');
    if (item.GLAccount) keys.push('GLAccount');

    return Array.from(new Set(keys));
}
