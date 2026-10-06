/**
 * The private truth of the URL-scan evaluation samples (plan 10.2, 10.3, U02).
 *
 * This directory is the evaluation side of the boundary the plan draws: it holds the variant labels
 * and expected finding keys that a scanned page must never reveal, and it lives under
 * `evaluation/private/` precisely so it can never be imported by production code.
 *
 * Nothing here is a threshold the developer chose to make a run pass. `expectedFindingKey` names a
 * defect the fixture actually has and a person can reproduce by hand; the scorer confirms a defect
 * only when an independent replay reproduces that key. The build identity is deliberately *not* a
 * frozen constant - it is supplied by the frozen-build manifest at scoring time, and a score computed
 * without it is rejected, so a result can never be attributed to a build it did not come from.
 */

export interface UrlScanSampleTruth {
  readonly sampleId: string
  readonly variant: 'healthy' | 'defective'
  /** The exact public entry a run on this sample must start from. */
  readonly entryUrl: string
  /**
   * The defect this variant is known to have, as a stable key the independent replay reproduces by
   * hand. Absent for a healthy control, which must produce no supported finding at all.
   */
  readonly expectedFindingKey?: string
  /** What a human sees when the defect is present, for the reviewer's independent reproduction. */
  readonly reproduction?: string
}

export interface UrlScanTruth {
  /**
   * The frozen build's identity, filled in from the build manifest at scoring time. A literal here
   * would make every score claim the tree that happened to be checked out when it was written.
   */
  readonly buildIdentity: string
  readonly entryUrl: string
  readonly samples: readonly UrlScanSampleTruth[]
}

/**
 * The sample set, as designed in plan 10.2.
 *
 * A first-round UI matrix of five samples: one standalone healthy catalogue site whose interactions
 * the generic rules can exercise, then two normal/abnormal pairs - one exercisable by the generic
 * overlay rule, one needing the existing DOM investigation primitives.
 *
 * Each defective sample has a healthy control on the **same public entry path** and with the same
 * visible structure, differing only by the private variant. That pairing is what makes a defect claim
 * mean something: without it, a run that reports a problem on the defective page has shown a
 * difference between two pages, not that the difference is the defect.
 *
 * Ports are placeholders: the real fixtures bind at run time and the harness substitutes their
 * origins, so this file describes *what* each sample is rather than where it happens to run.
 */
export function urlScanTruth(
  buildIdentity = process.env.URL_SCAN_BUILD_IDENTITY ?? '',
): UrlScanTruth {
  const base = process.env.URL_SCAN_FIXTURE_ORIGIN ?? 'http://127.0.0.1:5060'
  return {
    buildIdentity,
    entryUrl: `${base}/catalog?category=books&sort=price`,
    samples: [
      {
        sampleId: 'healthy-catalog',
        variant: 'healthy',
        entryUrl: `${base}/catalog?category=books&sort=price`,
      },
      {
        sampleId: 'overlay-healthy',
        variant: 'healthy',
        entryUrl: `${base}/overlay?category=books`,
      },
      {
        sampleId: 'overlay-defect',
        variant: 'defective',
        entryUrl: `${base}/overlay?category=books`,
        expectedFindingKey: 'foreground-control-covered',
        reproduction:
          `Open ${base}/overlay?category=books, click the "Filters" button. On the healthy variant the` +
          ` panel opens; on this variant an invisible overlay at ${controlOrigin}/__control returns the` +
          ` hit test, so the button is present, visible and enabled but the click never reaches it.`,
      },
      {
        sampleId: 'dom-healthy',
        variant: 'healthy',
        entryUrl: `${base}/detail?id=1`,
      },
      {
        sampleId: 'dom-investigation-defect',
        variant: 'defective',
        entryUrl: `${base}/detail?id=1`,
        expectedFindingKey: 'sort-ignores-selection',
        reproduction:
          `Open ${base}/detail?id=1, set the sort control to "price" and press apply. On the healthy` +
          ` variant the rows reorder; here the request is made but the rendered order is unchanged,` +
          ` which a DOM measurement of the first row's text shows.`,
      },
    ],
  }
}

/**
 * The control origin, exported separately so a reviewer can see it is a distinct service from the
 * public fixtures rather than a path the scanned page could reach.
 */
export const controlOrigin = process.env.URL_SCAN_CONTROL_ORIGIN ?? 'http://127.0.0.1:5061'
