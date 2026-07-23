const DEFAULT_GENE_ORDER = [
  'RBP1_count',
  'TBP_count',
  'Galpha_count',
  'Gbeta_count',
  'Ggamma_count',
  'cAMP_count',
  'classC_count',
  'classA_count',
  'classB1_count',
  'classB2_count',
  'Mth_count',
  'classF_count',
  'FSLB_count',
  'Olfactory_count',
  'classT_count',
  'Vomeronasal1_count',
  'Nematode_count',
  'GP157_count',
  'GP143_count',
  'Vomeronasal2_count',
  'GPR1_count',
  'STE2_count',
  'STE3_count',
] as const

const GENE_LABELS: Record<string, string> = {
  RBP1_count: 'RPB1',
  TBP_count: 'TBP',
  Galpha_count: 'G-alpha',
  Gbeta_count: 'G-beta',
  Ggamma_count: 'G-gamma',
  cAMP_count: 'cAMP',
  classC_count: 'Class C',
  classA_count: 'Class A',
  classB1_count: 'Class B1',
  classB2_count: 'Class B2',
  Mth_count: 'Mth',
  classF_count: 'Class F',
  FSLB_count: 'FSL',
  Olfactory_count: 'Olfactory',
  classT_count: 'Taste-2',
  Vomeronasal1_count: 'Vomeronasal 1',
  Nematode_count: 'Nematode',
  GP157_count: 'GP157',
  GP143_count: 'GP143',
  Vomeronasal2_count: 'Vomeronasal 2',
  GPR1_count: 'GPR1',
  STE2_count: 'STE2',
  STE3_count: 'STE3',
}

const DEFAULT_ORDER_INDEX = new Map<string, number>(
  DEFAULT_GENE_ORDER.map((gene, index) => [gene, index] as const)
)

const HOUSEKEEPING_CONTROLS = new Set<string>(['RBP1_count', 'TBP_count'])
const G_PROTEIN_SIGNALING_CONTROLS = new Set<string>([
  'Galpha_count',
  'Gbeta_count',
  'Ggamma_count',
])

export function formatPhyleticGeneLabel(gene: string) {
  return GENE_LABELS[gene] || gene.replace(/_count$/, '')
}

export function formatPhyleticGeneMenuLabel(gene: string) {
  if (gene === 'Vomeronasal1_count') return 'V1R'
  if (gene === 'Vomeronasal2_count') return 'V2R'
  return formatPhyleticGeneLabel(gene)
}

export function formatPhyleticGeneMenuTooltip(gene: string) {
  if (gene === 'RBP1_count') return 'DNA-directed RNA polymerase II subunit RPB1'
  if (gene === 'TBP_count') return 'TATA-box-binding protein'
  return formatPhyleticGeneLabel(gene)
}

export function sortPhyleticGenes(genes: string[]) {
  return genes
    .map((gene, originalIndex) => ({ gene, originalIndex }))
    .sort((left, right) => {
      const leftIndex = DEFAULT_ORDER_INDEX.get(left.gene)
      const rightIndex = DEFAULT_ORDER_INDEX.get(right.gene)

      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex
      if (leftIndex !== undefined) return -1
      if (rightIndex !== undefined) return 1
      return left.originalIndex - right.originalIndex
    })
    .map(({ gene }) => gene)
}

export function isHousekeepingControl(gene: string) {
  return HOUSEKEEPING_CONTROLS.has(gene)
}

export function isGProteinSignalingControl(gene: string) {
  return G_PROTEIN_SIGNALING_CONTROLS.has(gene)
}
