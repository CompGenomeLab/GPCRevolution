import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve('.');
const DEFAULT_INPUT = path.join(
  ROOT,
  'public',
  'phyletic-distribution',
  'taxonomy_eukaryotes_filtered.json'
);
const DEFAULT_OUTPUT = path.join(
  ROOT,
  'public',
  'phyletic-distribution',
  'taxonomy_eukaryotes_filtered.nwk'
);
const DEFAULT_ORDER_OUTPUT = path.join(
  ROOT,
  'public',
  'phyletic-distribution',
  'taxonomy_eukaryotes_filtered.tree-order.json'
);

// Conventional ranks used only by the optional reduced-rank builders.
const EXPANDED_RANKS = [
  'domain',
  'kingdom',
  'subkingdom',
  'phylum',
  'subphylum',
  'superclass',
  'class',
  'subclass',
  'infraclass',
  'cohort',
  'subcohort',
  'superorder',
  'order',
  'suborder',
  'infraorder',
  'parvorder',
  'superfamily',
  'family',
  'subfamily',
  'tribe',
  'subtribe',
  'genus',
  'subgenus',
  'section',
  'series',
  'species group',
  'species subgroup',
  'species',
  'subspecies',
  'varietas',
  'forma',
  'forma specialis',
  'strain',
  'isolate',
];

const VISUALIZATION_RANKS = [
  'domain',
  'kingdom',
  'phylum',
  'subphylum',
  'superclass',
  'class',
  'superorder',
  'order',
  'suborder',
  'infraorder',
  'parvorder',
  'superfamily',
  'family',
  'subfamily',
  'genus',
  'species',
];

const MISSING_VALUES = new Set([
  '',
  'na',
  'n/a',
  'none',
  'null',
  'undefined',
  'unknown',
  'unclassified',
]);

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv
    .slice(2)
    .find(value => value.startsWith(prefix));

  return argument ? argument.slice(prefix.length) : fallback;
}

function normalizeValue(value) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();

  return MISSING_VALUES.has(normalized.toLowerCase())
    ? null
    : normalized;
}

function createNode(rankIndex = -1, rank = null, name = null) {
  return {
    rankIndex,
    rank,
    name,
    children: new Map(),
    isTip: false,
    tipName: null,
    sourceIndex: null,
    distance: 0,
  };
}

function resolveColumns(records) {
  const lowerToActual = new Map();

  for (const record of records) {
    for (const key of Object.keys(record)) {
      const lower = key.toLowerCase();
      const existing = lowerToActual.get(lower);

      // Prefer the display-rank column "Species" over the lowercase
      // convenience field "species" when both are present.
      if (!existing || (existing === lower && key !== lower)) {
        lowerToActual.set(lower, key);
      }
    }
  }

  return lowerToActual;
}

function validateFlatSchema(records) {
  const expected = Object.keys(records[0]);

  records.forEach((record, index) => {
    const actual = Object.keys(record);

    if (
      actual.length !== expected.length ||
      actual.some(
        (column, columnIndex) =>
          column !== expected[columnIndex]
      )
    ) {
      throw new Error(
        `Taxonomy record ${index} does not use the same columns ` +
        'in the same order as record 0.'
      );
    }
  });

  return expected;
}

function isAllModeTaxonomyColumn(actualColumn) {
  const lower = actualColumn.toLowerCase();

  if (lower === 'taxid') {
    return false;
  }

  // Lowercase "species" is the convenience label.
  // Capitalized "Species" remains a taxonomy column.
  if (actualColumn === 'species') {
    return false;
  }

  return true;
}

function buildHierarchy(records, ranks, columns) {
  const root = createNode(-1);
  const taxIDColumn = columns.get('taxid');

  if (!taxIDColumn) {
    throw new Error(
      'The taxonomy JSON does not contain a taxID column.'
    );
  }

  const seenTaxIDs = new Set();

  records.forEach((record, sourceIndex) => {
    const taxID = normalizeValue(record[taxIDColumn]);

    if (!taxID) {
      throw new Error(
        'A taxonomy record has an empty taxID.'
      );
    }

    if (seenTaxIDs.has(taxID)) {
      throw new Error(
        `Duplicate taxID in taxonomy JSON: ${taxID}`
      );
    }

    seenTaxIDs.add(taxID);

    let parent = root;
    let previousValue = null;

    ranks.forEach((rank, rankIndex) => {
      const column = columns.get(rank);
      const value = column
        ? normalizeValue(record[column])
        : null;

      if (!value || value === previousValue) {
        return;
      }

      const childKey = `${rankIndex}\u0000${value}`;

      if (!parent.children.has(childKey)) {
        parent.children.set(
          childKey,
          createNode(rankIndex, rank, value)
        );
      }

      parent = parent.children.get(childKey);
      previousValue = value;
    });

    const tipKey = `tip\u0000${taxID}`;
    const tip = createNode(ranks.length);

    tip.isTip = true;
    tip.tipName = taxID;
    tip.sourceIndex = sourceIndex;

    parent.children.set(tipKey, tip);
  });

  return {
    root,
    taxIDColumn,
    tipCount: seenTaxIDs.size,
  };
}

function containsEvery(container, members) {
  return members.every(member => container.has(member));
}

function taxonomyGroupContext(record, column, columns) {
  const valueAt = lowerColumn => {
    const actualColumn = columns.get(lowerColumn);

    return actualColumn
      ? normalizeValue(record[actualColumn])
      : null;
  };

  const rankIndex = EXPANDED_RANKS.indexOf(column);

  if (rankIndex > 0) {
    for (
      let index = rankIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const value = valueAt(EXPANDED_RANKS[index]);

      if (value) {
        return `${EXPANDED_RANKS[index]}=${value}`;
      }
    }
  }

  const cladeMatch = column.match(
    /^clade(?: (\d+))?$/
  );

  if (cladeMatch) {
    const cladeIndex = Number(
      cladeMatch[1] || 0
    );

    for (
      let index = cladeIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const previousColumn =
        index === 0
          ? 'clade'
          : `clade ${index}`;

      const value = valueAt(previousColumn);

      if (value) {
        return `${previousColumn}=${value}`;
      }
    }

    const domain = valueAt('domain');

    return domain
      ? `domain=${domain}`
      : '';
  }

  const noRankMatch = column.match(
    /^no rank(?: (\d+))?$/
  );

  if (noRankMatch) {
    const noRankIndex = Number(
      noRankMatch[1] || 0
    );

    for (
      let index = noRankIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const previousColumn =
        index === 0
          ? 'no rank'
          : `no rank ${index}`;

      const value = valueAt(previousColumn);

      if (value) {
        return `${previousColumn}=${value}`;
      }
    }

    for (const anchor of [
      'genus',
      'family',
      'order',
      'class',
      'phylum',
      'kingdom',
      'domain',
    ]) {
      const value = valueAt(anchor);

      if (value) {
        return `${anchor}=${value}`;
      }
    }
  }

  return '';
}

function buildCompleteHierarchy(
  records,
  columns,
  schemaColumns
) {
  const root = createNode(-1, null, null);
  const taxIDColumn = columns.get('taxid');

  if (!taxIDColumn) {
    throw new Error(
      'The taxonomy JSON does not contain a taxID column.'
    );
  }

  // In all mode, use every nonmetadata JSON column in the exact
  // order produced by the Python lineage builder. This prevents
  // a hard-coded rank whitelist from silently dropping uncommon
  // NCBI ranks.
  const taxonomyColumns = schemaColumns
    .filter(isAllModeTaxonomyColumn)
    .map(actualColumn => [
      actualColumn.toLowerCase(),
      actualColumn,
    ]);

  const taxonomyColumnOrder = new Map(
    taxonomyColumns.map(
      ([column], index) => [column, index]
    )
  );

  const groupsByKey = new Map();
  const recordGroupKeys = records.map(() => []);
  const seenTaxIDs = new Set();

  records.forEach((record, sourceIndex) => {
    const taxID = normalizeValue(
      record[taxIDColumn]
    );

    if (!taxID) {
      throw new Error(
        'A taxonomy record has an empty taxID.'
      );
    }

    if (seenTaxIDs.has(taxID)) {
      throw new Error(
        `Duplicate taxID in taxonomy JSON: ${taxID}`
      );
    }

    seenTaxIDs.add(taxID);

    taxonomyColumns.forEach(
      ([column, actualColumn]) => {
        const value = normalizeValue(
          record[actualColumn]
        );

        if (!value) {
          return;
        }

        const context = taxonomyGroupContext(
          record,
          column,
          columns
        );

        const key =
          `${column}\u0000${value}\u0000${context}`;

        let group = groupsByKey.get(key);

        if (!group) {
          group = {
            key,
            column,
            value,
            members: [],
          };

          groupsByKey.set(key, group);
        }

        group.members.push(sourceIndex);
        recordGroupKeys[sourceIndex].push(key);
      }
    );
  });

  // Groups with identical sampled descendants are retained as
  // successive unary nodes so no populated taxonomy layer is
  // discarded.
  const classesBySignature = new Map();

  groupsByKey.forEach(group => {
    const signature = group.members.join(',');
    let groupClass =
      classesBySignature.get(signature);

    if (!groupClass) {
      groupClass = {
        signature,
        members: group.members,
        memberSet: new Set(group.members),
        groups: [],
        parent: null,
        firstNode: null,
        lastNode: null,
      };

      classesBySignature.set(
        signature,
        groupClass
      );
    }

    groupClass.groups.push(group);
  });

  const groupClasses = Array.from(
    classesBySignature.values()
  );

  const classByGroupKey = new Map();

  groupClasses.forEach(groupClass => {
    // The Python script orders columns from broad to specific
    // using their observed positions in the actual NCBI lineages.
    // Use that order for otherwise unresolvable equal-descendant
    // unary chains.
    groupClass.groups.sort((a, b) =>
      taxonomyColumnOrder.get(a.column) -
        taxonomyColumnOrder.get(b.column) ||
      a.value.localeCompare(b.value)
    );

    groupClass.groups.forEach(group => {
      classByGroupKey.set(
        group.key,
        groupClass
      );
    });
  });

  const recordClasses = recordGroupKeys.map(
    keys =>
      Array.from(
        new Set(
          keys.map(
            key => classByGroupKey.get(key)
          )
        )
      )
  );

  // Every pair of groups containing the same tip must be nested.
  // This catches homonyms or malformed flattened data before they
  // create a crossing tree.
  recordClasses.forEach(
    (classes, sourceIndex) => {
      const ordered = [...classes].sort(
        (a, b) =>
          b.members.length - a.members.length
      );

      for (
        let index = 1;
        index < ordered.length;
        index += 1
      ) {
        if (
          !containsEvery(
            ordered[index - 1].memberSet,
            ordered[index].members
          )
        ) {
          const broader = ordered[index - 1].groups
            .map(
              group =>
                `${group.column}=${group.value}`
            )
            .join('|');

          const narrower = ordered[index].groups
            .map(
              group =>
                `${group.column}=${group.value}`
            )
            .join('|');

          throw new Error(
            `Taxonomy groups overlap without nesting for taxID ` +
            `${records[sourceIndex][taxIDColumn]}: ` +
            `${broader} ` +
            `(${ordered[index - 1].members.length}) versus ` +
            `${narrower} ` +
            `(${ordered[index].members.length}).`
          );
        }
      }
    }
  );

  groupClasses.forEach(groupClass => {
    const firstMember =
      groupClass.members[0];

    const candidates =
      recordClasses[firstMember]
        .filter(candidate =>
          candidate !== groupClass &&
          candidate.members.length >
            groupClass.members.length &&
          containsEvery(
            candidate.memberSet,
            groupClass.members
          )
        )
        .sort(
          (a, b) =>
            a.members.length -
            b.members.length
        );

    groupClass.parent =
      candidates[0] || null;
  });

  // Materialize each equal-descendant class as a deterministic
  // unary chain.
  groupClasses
    .sort(
      (a, b) =>
        b.members.length -
          a.members.length ||
        a.members[0] -
          b.members[0]
    )
    .forEach(groupClass => {
      let previous = null;

      groupClass.groups.forEach(group => {
        const node = createNode(
          taxonomyColumnOrder.get(
            group.column
          ),
          group.column,
          group.value
        );

        node.sourceIndex =
          group.members[0];

        if (!groupClass.firstNode) {
          groupClass.firstNode = node;
        }

        if (previous) {
          previous.children.set(
            group.key,
            node
          );
        }

        previous = node;
      });

      groupClass.lastNode = previous;

      const parentNode =
        groupClass.parent
          ? groupClass.parent.lastNode
          : root;

      parentNode.children.set(
        groupClass.groups[0].key,
        groupClass.firstNode
      );
    });

  records.forEach(
    (record, sourceIndex) => {
      const taxID = String(
        record[taxIDColumn]
      );

      const mostSpecificClass = [
        ...recordClasses[sourceIndex],
      ].sort(
        (a, b) =>
          a.members.length -
          b.members.length
      )[0];

      const parent =
        mostSpecificClass
          ? mostSpecificClass.lastNode
          : root;

      const tip = createNode(
        taxonomyColumns.length
      );

      tip.isTip = true;
      tip.tipName = taxID;
      tip.sourceIndex = sourceIndex;

      parent.children.set(
        `tip\u0000${taxID}`,
        tip
      );
    }
  );

  return {
    root,
    taxIDColumn,
    tipCount: seenTaxIDs.size,
    taxonomyColumns:
      taxonomyColumns.map(
        ([column]) => column
      ),
    taxonomyGroups:
      groupsByKey.size,
    identicalDescendantChains:
      groupClasses.filter(
        groupClass =>
          groupClass.groups.length > 1
      ).length,
  };
}

function sortChildrenByInputOrder(node) {
  if (node.isTip) {
    return node.sourceIndex;
  }

  const children = Array.from(
    node.children.entries()
  )
    .map(([key, child]) => ({
      key,
      child,
      minimum:
        sortChildrenByInputOrder(child),
    }))
    .sort(
      (a, b) =>
        a.minimum -
          b.minimum ||
        a.key.localeCompare(b.key)
    );

  node.children = new Map(
    children.map(
      ({ key, child }) => [key, child]
    )
  );

  return children.length
    ? children[0].minimum
    : Number.MAX_SAFE_INTEGER;
}

function assignStretchedDistances(root) {
  const assignHeight = node => {
    if (node.isTip) {
      node.height = 0;
      return 0;
    }

    node.height =
      1 +
      Math.max(
        ...Array.from(
          node.children.values()
        ).map(assignHeight)
      );

    return node.height;
  };

  const maximumDepth =
    assignHeight(root);

  const assignDistance = node => {
    node.distance =
      maximumDepth - node.height;

    node.children.forEach(
      assignDistance
    );
  };

  assignDistance(root);

  return maximumDepth;
}

function encodeInternalLabel(node) {
  const encodedName =
    encodeURIComponent(node.name).replace(
      /[()']/g,
      character =>
        `%${character
          .charCodeAt(0)
          .toString(16)
          .toUpperCase()}`
    );

  return `${node.rank}__${encodedName}`;
}

function serializeNode(
  node,
  parentDistance,
  includeInternalLabels
) {
  const branchLength = Math.max(
    1,
    node.distance - parentDistance
  );

  if (node.isTip) {
    return `${node.tipName}:${branchLength}`;
  }

  const children = Array.from(
    node.children.values()
  )
    .map(child =>
      serializeNode(
        child,
        node.distance,
        includeInternalLabels
      )
    )
    .join(',');

  const label = includeInternalLabels
    ? encodeInternalLabel(node)
    : '';

  return (
    `(${children})` +
    `${label}:${branchLength}`
  );
}

function serializeTree(
  root,
  includeInternalLabels
) {
  const children = Array.from(
    root.children.values()
  )
    .map(child =>
      serializeNode(
        child,
        root.distance,
        includeInternalLabels
      )
    )
    .join(',');

  return `(${children});\n`;
}

function collectStats(root) {
  const stats = {
    nodes: 0,
    tips: 0,
    unaryNodes: 0,
    bifurcations: 0,
    multifurcations: 0,
    maximumChildren: 0,
    nonContiguousInternalNodes: 0,
  };

  const visit = node => {
    stats.nodes += 1;

    if (node.isTip) {
      stats.tips += 1;

      return {
        minimum: node.sourceIndex,
        maximum: node.sourceIndex,
        tips: 1,
      };
    }

    const childCount =
      node.children.size;

    stats.maximumChildren = Math.max(
      stats.maximumChildren,
      childCount
    );

    if (childCount === 1) {
      stats.unaryNodes += 1;
    } else if (childCount === 2) {
      stats.bifurcations += 1;
    } else if (childCount > 2) {
      stats.multifurcations += 1;
    }

    const spans = Array.from(
      node.children.values()
    ).map(visit);

    const minimum = Math.min(
      ...spans.map(span => span.minimum)
    );

    const maximum = Math.max(
      ...spans.map(span => span.maximum)
    );

    const tips = spans.reduce(
      (sum, span) =>
        sum + span.tips,
      0
    );

    if (
      maximum - minimum + 1 !== tips
    ) {
      stats.nonContiguousInternalNodes += 1;
    }

    return {
      minimum,
      maximum,
      tips,
    };
  };

  visit(root);

  return stats;
}

function collectTipOrder(root) {
  const order = [];

  const visit = node => {
    if (node.isTip) {
      order.push(node.tipName);
      return;
    }

    node.children.forEach(visit);
  };

  visit(root);

  return order;
}

function collectTipDistances(root) {
  const distances = [];

  const visit = node => {
    if (node.isTip) {
      distances.push(node.distance);
      return;
    }

    node.children.forEach(visit);
  };

  visit(root);

  return distances;
}

const inputPath = path.resolve(
  readOption(
    'input',
    DEFAULT_INPUT
  )
);

const outputPath = path.resolve(
  readOption(
    'output',
    DEFAULT_OUTPUT
  )
);

const orderOutputPath = path.resolve(
  readOption(
    'order-output',
    DEFAULT_ORDER_OUTPUT
  )
);

const rankSet = readOption(
  'rank-set',
  'all'
);

const includeInternalLabels =
  !process.argv.includes(
    '--no-internal-labels'
  );

const ranks =
  rankSet === 'visualization'
    ? VISUALIZATION_RANKS
    : EXPANDED_RANKS;

if (!fs.existsSync(inputPath)) {
  throw new Error(
    `Taxonomy JSON not found: ${inputPath}`
  );
}

if (
  ![
    'all',
    'expanded',
    'visualization',
  ].includes(rankSet)
) {
  throw new Error(
    '--rank-set must be "all", ' +
    '"expanded", or "visualization".'
  );
}

const records = JSON.parse(
  fs.readFileSync(
    inputPath,
    'utf8'
  )
);

if (
  !Array.isArray(records) ||
  records.length === 0
) {
  throw new Error(
    'Taxonomy JSON must be a non-empty array.'
  );
}

const schemaColumns =
  validateFlatSchema(records);

const columns =
  resolveColumns(records);

const missingRankColumns =
  rankSet === 'all'
    ? []
    : ranks.filter(
        rank => !columns.has(rank)
      );

const hierarchy =
  rankSet === 'all'
    ? buildCompleteHierarchy(
        records,
        columns,
        schemaColumns
      )
    : buildHierarchy(
        records,
        ranks,
        columns
      );

const {
  root,
  tipCount,
} = hierarchy;

sortChildrenByInputOrder(root);

const maximumTreeDepth =
  assignStretchedDistances(root);

const stats =
  collectStats(root);

const tipOrder =
  collectTipOrder(root);

const tipDistances =
  collectTipDistances(root);

const uniqueTipDistances =
  new Set(tipDistances);

if (
  stats.tips !== tipCount ||
  stats.tips !== records.length
) {
  throw new Error(
    `Tree validation failed: expected ` +
    `${records.length} tips, generated ` +
    `${stats.tips}.`
  );
}

if (
  uniqueTipDistances.size !== 1 ||
  tipDistances[0] !== maximumTreeDepth
) {
  throw new Error(
    'Tree validation failed: stretched layout ' +
    'does not align every tip.'
  );
}

if (
  rankSet === 'all' &&
  stats.nodes !==
    hierarchy.taxonomyGroups +
      records.length +
      1
) {
  throw new Error(
    'Tree validation failed: one or more ' +
    'populated taxonomy groups were lost.'
  );
}

if (
  rankSet === 'all' &&
  stats.nonContiguousInternalNodes !== 0
) {
  throw new Error(
    `Tree validation failed: ` +
    `${stats.nonContiguousInternalNodes} taxonomy ` +
    'groups are not contiguous in the JSON input order.'
  );
}

const newick = serializeTree(
  root,
  includeInternalLabels
);

if (!newick.endsWith(';\n')) {
  throw new Error(
    'Generated Newick is missing its terminator.'
  );
}

fs.mkdirSync(
  path.dirname(outputPath),
  { recursive: true }
);

fs.writeFileSync(
  outputPath,
  newick,
  'utf8'
);

fs.mkdirSync(
  path.dirname(orderOutputPath),
  { recursive: true }
);

fs.writeFileSync(
  orderOutputPath,
  `${JSON.stringify(
    tipOrder,
    null,
    2
  )}\n`,
  'utf8'
);

const inputTaxIDOrder = records.map(
  record =>
    String(
      record[
        columns.get('taxid')
      ]
    )
);

const inputOrderMatchesTree =
  inputTaxIDOrder.every(
    (taxID, index) =>
      tipOrder[index] === taxID
  );

if (!inputOrderMatchesTree) {
  throw new Error(
    'Tree validation failed: Newick tip order ' +
    'differs from JSON record order.'
  );
}

console.log(
  JSON.stringify(
    {
      input: inputPath,
      output: outputPath,
      orderOutput: orderOutputPath,
      rankSet,
      ranksUsed:
        rankSet === 'all'
          ? hierarchy.taxonomyColumns
          : ranks.filter(
              rank =>
                columns.has(rank)
            ),
      missingRankColumns,
      taxonomyGroups:
        hierarchy.taxonomyGroups,
      identicalDescendantChains:
        hierarchy.identicalDescendantChains,
      maximumTreeDepth,
      alignedTipDistance:
        tipDistances[0],
      records: records.length,
      inputOrderMatchesTree,
      ...stats,
    },
    null,
    2
  )
);
