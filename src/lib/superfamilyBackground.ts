// Families shown on the superfamily logo page for comparison only. They get their own
// logo rows but never enter a cross-family calculation (the conservation bar, the
// families-above-threshold filter, the scatter plot), so they cannot shift what the
// page reports about the GPCR families.
//   STE2      fungal pheromone receptors with no evidence of common origin with the others
//   SLT_TRNS  a non-GPCR 7TM family, placed on the superfamily alignment by topology alone
export const BACKGROUND_FAMILIES = new Set(['STE2', 'SLT_TRNS']);

// Selection IDs look like '<family>_genes_filtered_db_FAMSA.ref_trimmed'.
export function isBackgroundFamily(selectionId: string): boolean {
  return BACKGROUND_FAMILIES.has(selectionId.split('_genes_')[0]);
}
