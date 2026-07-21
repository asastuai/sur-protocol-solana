/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/perp_engine.json`.
 */
export type PerpEngine = {
  "address": "BnPETJ3Wa9M2nNLr6Gua3HwKhQyFHfXTXqBwh8KLSFK2",
  "metadata": {
    "name": "perpEngine",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SUR Protocol — PerpEngine. Solana port of PerpEngine.sol (core subset). v0.2 ships with Market + Position state, openPosition / closePosition / updateMarkPrice. Funding, liquidation eligibility, OI caps, margin tiers, cross/isolated modes, price impact land in v0.3 (Liquidator + AutoDeleveraging as separate programs mirror Solidity)."
  },
  "instructions": [
    {
      "name": "acceptOwnership",
      "discriminator": [
        172,
        23,
        43,
        13,
        238,
        213,
        85,
        150
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pendingOwner",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "addMarket",
      "discriminator": [
        41,
        137,
        185,
        126,
        69,
        139,
        254,
        55
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketId"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "engineConfig"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "initialMarginBps",
          "type": "u64"
        },
        {
          "name": "maintenanceMarginBps",
          "type": "u64"
        },
        {
          "name": "maxPositionSize",
          "type": "u64"
        }
      ]
    },
    {
      "name": "bootstrapEnginePool",
      "discriminator": [
        124,
        237,
        57,
        229,
        201,
        38,
        16,
        106
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "perpVaultProgram"
        },
        {
          "name": "vaultConfig",
          "writable": true
        },
        {
          "name": "usdcVault",
          "writable": true
        },
        {
          "name": "authorityUsdc",
          "writable": true
        },
        {
          "name": "enginePoolBalance",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "engineConfig"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "closePosition",
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "operatorAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "operator",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "fillPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "docs": [
            "Pre-funded by owner with rent for downstream init_if_needed. Must be",
            "pre-registered as operator on perp_vault (one-time set_operator call).",
            "Holds engine_pool AccountBalance (margin + counterparty pool) on vault."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "perpVault"
        },
        {
          "name": "oracleRouter"
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "liquidatePosition",
      "discriminator": [
        187,
        74,
        229,
        149,
        102,
        81,
        221,
        68
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "operatorAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "operator",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "openPosition",
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "trader"
        },
        {
          "name": "operatorAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "operator",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "sizeDelta",
          "type": "i64"
        },
        {
          "name": "fillPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pause",
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "engineConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "reducePosition",
      "discriminator": [
        96,
        202,
        33,
        80,
        24,
        197,
        33,
        77
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "operatorAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "operator",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "sizeDelta",
          "type": "i64"
        },
        {
          "name": "fillPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setInsuranceFundBalance",
      "discriminator": [
        125,
        49,
        119,
        62,
        10,
        40,
        144,
        199
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "engineConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "balance",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setOperator",
      "discriminator": [
        238,
        153,
        101,
        169,
        243,
        131,
        36,
        1
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "operatorAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "engineConfig"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "operator",
          "type": "pubkey"
        },
        {
          "name": "status",
          "type": "bool"
        }
      ]
    },
    {
      "name": "transferOwnership",
      "discriminator": [
        65,
        177,
        215,
        73,
        53,
        45,
        99,
        47
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "engineConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "unpause",
      "discriminator": [
        169,
        144,
        4,
        38,
        10,
        141,
        188,
        255
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "engineConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateMarkPrice",
      "discriminator": [
        45,
        127,
        122,
        166,
        7,
        30,
        90,
        45
      ],
      "accounts": [
        {
          "name": "engineConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "operatorAccount",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  112,
                  101,
                  114,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "operator"
              }
            ]
          }
        },
        {
          "name": "operator",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "newMarkPrice",
          "type": "u64"
        },
        {
          "name": "newIndexPrice",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "engineConfig",
      "discriminator": [
        10,
        197,
        172,
        236,
        51,
        169,
        22,
        207
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "operator",
      "discriminator": [
        219,
        31,
        188,
        145,
        69,
        139,
        204,
        117
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "badDebt",
      "discriminator": [
        192,
        33,
        54,
        41,
        223,
        158,
        37,
        34
      ]
    },
    {
      "name": "liquidationDistributed",
      "discriminator": [
        41,
        230,
        102,
        209,
        243,
        135,
        127,
        93
      ]
    },
    {
      "name": "markPriceUpdated",
      "discriminator": [
        7,
        90,
        41,
        114,
        164,
        146,
        198,
        36
      ]
    },
    {
      "name": "marketAdded",
      "discriminator": [
        170,
        8,
        231,
        175,
        249,
        85,
        111,
        175
      ]
    },
    {
      "name": "operatorUpdated",
      "discriminator": [
        28,
        104,
        226,
        145,
        253,
        229,
        17,
        245
      ]
    },
    {
      "name": "ownershipTransferStarted",
      "discriminator": [
        183,
        253,
        239,
        246,
        140,
        179,
        133,
        105
      ]
    },
    {
      "name": "ownershipTransferred",
      "discriminator": [
        172,
        61,
        205,
        183,
        250,
        50,
        38,
        98
      ]
    },
    {
      "name": "pauseStatusChanged",
      "discriminator": [
        79,
        144,
        205,
        195,
        9,
        152,
        146,
        91
      ]
    },
    {
      "name": "positionClosed",
      "discriminator": [
        157,
        163,
        227,
        228,
        13,
        97,
        138,
        121
      ]
    },
    {
      "name": "positionModified",
      "discriminator": [
        2,
        251,
        140,
        65,
        176,
        78,
        250,
        126
      ]
    },
    {
      "name": "positionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notOwner",
      "msg": "Caller is not owner"
    },
    {
      "code": 6001,
      "name": "notPendingOwner",
      "msg": "Caller is not pending owner"
    },
    {
      "code": 6002,
      "name": "notOperator",
      "msg": "Caller is not an authorized operator"
    },
    {
      "code": 6003,
      "name": "pausedError",
      "msg": "Engine is paused"
    },
    {
      "code": 6004,
      "name": "notPaused",
      "msg": "Engine is not paused"
    },
    {
      "code": 6005,
      "name": "zeroAmount",
      "msg": "Zero amount"
    },
    {
      "code": 6006,
      "name": "zeroAddress",
      "msg": "Zero address"
    },
    {
      "code": 6007,
      "name": "marketNotFound",
      "msg": "Market not found"
    },
    {
      "code": 6008,
      "name": "marketAlreadyExists",
      "msg": "Market already exists"
    },
    {
      "code": 6009,
      "name": "marketNotActive",
      "msg": "Market is not active"
    },
    {
      "code": 6010,
      "name": "insufficientMargin",
      "msg": "Insufficient margin"
    },
    {
      "code": 6011,
      "name": "noPosition",
      "msg": "No position"
    },
    {
      "code": 6012,
      "name": "invalidPrice",
      "msg": "Invalid price"
    },
    {
      "code": 6013,
      "name": "maxPositionExceeded",
      "msg": "Max position size exceeded"
    },
    {
      "code": 6014,
      "name": "stalePrice",
      "msg": "Stale price (last update older than max age)"
    },
    {
      "code": 6015,
      "name": "positionNotLiquidatable",
      "msg": "Position is not liquidatable (equity >= maintenance margin)"
    },
    {
      "code": 6016,
      "name": "invalidParam",
      "msg": "Invalid parameter"
    },
    {
      "code": 6017,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6018,
      "name": "notAReduce",
      "msg": "Not a reduce (open/increase via open_position, full close via close_position)"
    }
  ],
  "types": [
    {
      "name": "badDebt",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Shortfall amount (absolute). Solidity: loss - releasedMargin (close)",
              "or -effectiveMargin (liquidate)."
            ],
            "type": "u64"
          },
          {
            "name": "viaLiquidation",
            "docs": [
              "Liquidation = true; ordinary close with bad debt = false."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "engineConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "docs": [
              "Bump for the engine_authority PDA — used to sign CPIs into perp_vault."
            ],
            "type": "u8"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "pendingOwner",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "perpVault",
            "docs": [
              "Pubkey of the perp_vault program (for CPI on settlement)."
            ],
            "type": "pubkey"
          },
          {
            "name": "oracleRouter",
            "docs": [
              "Pubkey of the oracle_router program (only this program may push prices)."
            ],
            "type": "pubkey"
          },
          {
            "name": "enginePool",
            "docs": [
              "Canonical engine margin pool: the engine_authority's AccountBalance PDA on",
              "perp_vault. Set once at bootstrap_engine_pool. Every margin/PnL CPI requires",
              "the passed engine_pool_balance == this key (audit Gate 0a: C-1/H-2/N-1 fix)."
            ],
            "type": "pubkey"
          },
          {
            "name": "insuranceFundBalance",
            "docs": [
              "Canonical insurance-fund AccountBalance PDA on perp_vault. Set by the owner",
              "via set_insurance_fund_balance. Liquidation routes insurance flows only to",
              "this key (audit N-4 fix). Pubkey::default() = unset (enforcement skipped)."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "liquidationDistributed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "keeperReward",
            "type": "u64"
          },
          {
            "name": "insurancePayout",
            "type": "u64"
          },
          {
            "name": "badDebt",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "markPriceUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "oldPrice",
            "type": "u64"
          },
          {
            "name": "newPrice",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "initialMarginBps",
            "docs": [
              "5% = 500 — required margin to open (= max 20x leverage)"
            ],
            "type": "u64"
          },
          {
            "name": "maintenanceMarginBps",
            "docs": [
              "2.5% = 250 — below this is liquidatable (consumed by Liquidator program v0.3)"
            ],
            "type": "u64"
          },
          {
            "name": "maxPositionSize",
            "docs": [
              "Max position size per trader (SIZE_PRECISION units)"
            ],
            "type": "u64"
          },
          {
            "name": "markPrice",
            "docs": [
              "Mark price (6 decimals) — used for PnL + maintenance margin"
            ],
            "type": "u64"
          },
          {
            "name": "indexPrice",
            "docs": [
              "Index price (6 decimals) — used for funding (v0.3)"
            ],
            "type": "u64"
          },
          {
            "name": "lastPriceUpdate",
            "type": "i64"
          },
          {
            "name": "openInterestLong",
            "docs": [
              "Open interest in size units"
            ],
            "type": "u64"
          },
          {
            "name": "openInterestShort",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "initialMarginBps",
            "type": "u64"
          },
          {
            "name": "maintenanceMarginBps",
            "type": "u64"
          },
          {
            "name": "maxPositionSize",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "operator",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "authorized",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "operatorUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "ownershipTransferStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "currentOwner",
            "type": "pubkey"
          },
          {
            "name": "pendingOwner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ownershipTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "previousOwner",
            "type": "pubkey"
          },
          {
            "name": "newOwner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "pauseStatusChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isPaused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "size",
            "docs": [
              "Signed size — positive=long, negative=short, zero=no position"
            ],
            "type": "i64"
          },
          {
            "name": "entryPrice",
            "docs": [
              "Average entry price (6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "margin",
            "docs": [
              "Locked margin in USDC (6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "lastUpdated",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "positionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "closedSize",
            "type": "i64"
          },
          {
            "name": "exitPrice",
            "type": "u64"
          },
          {
            "name": "realizedPnl",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "positionModified",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "oldSize",
            "type": "i64"
          },
          {
            "name": "newSize",
            "type": "i64"
          },
          {
            "name": "newEntryPrice",
            "type": "u64"
          },
          {
            "name": "newMargin",
            "type": "u64"
          },
          {
            "name": "realizedPnl",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "positionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "marketId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "size",
            "type": "i64"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "margin",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
