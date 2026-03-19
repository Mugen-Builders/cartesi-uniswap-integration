export const INPUT_BOX_ABI = [
  {
    inputs: [
      { name: "_dapp", type: "address" },
      { name: "_input", type: "bytes" },
    ],
    name: "addInput",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/** ERC20 Portal: deposits transfer tokens to the dApp and notify the rollup. */
export const ERC20_PORTAL_ABI = [
  {
    inputs: [
      { name: "_token", type: "address" },
      { name: "_dapp", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_execLayerData", type: "bytes" },
    ],
    name: "depositERC20Tokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export const VAULT_ABI = [
  {
    inputs: [],
    name: "idleBalance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalUsdcUnderManagement",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "DEPLOY_THRESHOLD",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** USDCVaultWithLiquidity (merged vault+adapter): position amounts in the LP (token0, token1) and which is USDC. */
export const ADAPTER_ABI = [
  {
    inputs: [],
    name: "getPositionAmountsAndOrder",
    outputs: [
      { name: "amount0", internalType: "uint256", type: "uint256" },
      { name: "amount1", internalType: "uint256", type: "uint256" },
      { name: "isUsdcCurrency0", internalType: "bool", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Cartesi DApp (1.5): execute voucher and check if executed. */
export const CARTESI_DAPP_ABI = [
  {
    inputs: [
      { name: "_destination", internalType: "address", type: "address" },
      { name: "_payload", internalType: "bytes", type: "bytes" },
      {
        name: "_proof",
        internalType: "struct Proof",
        type: "tuple",
        components: [
          {
            name: "validity",
            internalType: "struct OutputValidityProof",
            type: "tuple",
            components: [
              { name: "inputIndexWithinEpoch", internalType: "uint64", type: "uint64" },
              { name: "outputIndexWithinInput", internalType: "uint64", type: "uint64" },
              { name: "outputHashesRootHash", internalType: "bytes32", type: "bytes32" },
              { name: "vouchersEpochRootHash", internalType: "bytes32", type: "bytes32" },
              { name: "noticesEpochRootHash", internalType: "bytes32", type: "bytes32" },
              { name: "machineStateHash", internalType: "bytes32", type: "bytes32" },
              { name: "outputHashInOutputHashesSiblings", internalType: "bytes32[]", type: "bytes32[]" },
              { name: "outputHashesInEpochSiblings", internalType: "bytes32[]", type: "bytes32[]" },
            ],
          },
          { name: "context", internalType: "bytes", type: "bytes" },
        ],
      },
    ],
    name: "executeVoucher",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "_inboxInputIndex", internalType: "uint256", type: "uint256" },
      { name: "_outputIndex", internalType: "uint256", type: "uint256" },
    ],
    name: "wasVoucherExecuted",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

