// queries.ts

export const NOTICES_QUERY = `
  query notices {
    notices {
      edges {
        node {
          index
          input {
            index
          }
          payload
        }
      }
    }
  }
`;

export const REPORTS_QUERY = `
  query reports {
    reports {
      edges {
        node {
          index
          input {
            index
          }
          payload
        }
      }
    }
  }
`;

/** List vouchers (Cartesi 1.5). Use first/after for pagination. */
export const VOUCHERS_QUERY = `
  query vouchers($first: Int, $after: String) {
    vouchers(first: $first, after: $after) {
      edges {
        node {
          index
          input {
            index
            timestamp
            blockNumber
          }
          destination
          payload
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** List vouchers with value inlined (no variables). Some nodes only expose this. */
export const VOUCHERS_QUERY_INLINE = `
  query vouchers {
    vouchers(first: 100) {
      edges {
        node {
          index
          input {
            index
            timestamp
            blockNumber
          }
          destination
          payload
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Get vouchers for a specific input (fallback when top-level vouchers is empty). */
export const VOUCHERS_BY_INPUT_QUERY = `
  query vouchersByInput($inputIndex: Int!) {
    input(index: $inputIndex) {
      vouchers(first: 20) {
        edges {
          node {
            index
            input { index timestamp blockNumber }
            destination
            payload
          }
        }
      }
    }
  }
`;

/** List recent inputs (to discover which inputs have vouchers). */
export const INPUTS_QUERY = `
  query inputs {
    inputs(first: 50) {
      edges {
        node {
          index
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Single voucher with proof (required for executeVoucher on L1). Cartesi 1.5. */
export const VOUCHER_WITH_PROOF_QUERY = `
  query voucher($voucherIndex: Int!, $inputIndex: Int!) {
    voucher(voucherIndex: $voucherIndex, inputIndex: $inputIndex) {
      index
      input { index }
      destination
      payload
      proof {
        validity {
          inputIndexWithinEpoch
          outputIndexWithinInput
          outputHashesRootHash
          vouchersEpochRootHash
          noticesEpochRootHash
          machineStateHash
          outputHashInOutputHashesSiblings
          outputHashesInEpochSiblings
        }
        context
      }
    }
  }
`;