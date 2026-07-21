/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/order_settlement.json`.
 */
export type OrderSettlement = {
  "address": "8EmiZ2VW9H2nkT45wnkex8iLLQ6B8S5NVuV8mYeHFHzJ",
  "metadata": {
    "name": "orderSettlement",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SUR Protocol — OrderSettlement. Bridges off-chain matching engine to on-chain execution: verifies trader signatures, collects fees, opens positions via CPI. Solana port of OrderSettlement.sol."
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
      "name": "commitOrder",
      "discriminator": [
        106,
        167,
        189,
        186,
        74,
        113,
        139,
        232
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "snapshot",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  109,
                  105,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "commitHash"
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
          "name": "commitHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "order",
          "type": {
            "defined": {
              "name": "signedOrder"
            }
          }
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "PDAs at perp_engine + perp_vault (positions, balances). Must be",
            "pre-registered as operator on both callee programs."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116,
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
          "name": "perpEngineProgram"
        },
        {
          "name": "perpEngineConfig"
        },
        {
          "name": "engineOperatorAccount"
        },
        {
          "name": "perpVaultProgram"
        },
        {
          "name": "perpVaultConfig"
        },
        {
          "name": "vaultOperatorAccount"
        },
        {
          "name": "feeRecipient"
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
      "args": [
        {
          "name": "clusterId",
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "setDynamicSpreadEnabled",
      "discriminator": [
        201,
        119,
        8,
        85,
        50,
        184,
        227,
        227
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "enabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setDynamicSpreadTiers",
      "discriminator": [
        24,
        25,
        104,
        25,
        251,
        151,
        196,
        85
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "tier1",
          "type": "u32"
        },
        {
          "name": "tier2",
          "type": "u32"
        },
        {
          "name": "tier3",
          "type": "u32"
        }
      ]
    },
    {
      "name": "setFeeRecipient",
      "discriminator": [
        227,
        18,
        215,
        42,
        237,
        246,
        151,
        66
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "newRecipient"
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "setFees",
      "discriminator": [
        137,
        178,
        49,
        58,
        0,
        245,
        242,
        190
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "maker",
          "type": "u32"
        },
        {
          "name": "taker",
          "type": "u32"
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
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
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
      "name": "setSettlementDelay",
      "discriminator": [
        122,
        91,
        209,
        53,
        160,
        209,
        137,
        158
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "minDelay",
          "type": "i64"
        },
        {
          "name": "maxDelay",
          "type": "i64"
        }
      ]
    },
    {
      "name": "settleOne",
      "discriminator": [
        52,
        71,
        62,
        219,
        31,
        240,
        162,
        72
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
          "name": "authority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116,
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
          "name": "makerNoncePage",
          "writable": true
        },
        {
          "name": "takerNoncePage",
          "writable": true
        },
        {
          "name": "perpEngineProgram"
        },
        {
          "name": "engineConfig"
        },
        {
          "name": "engineMarket",
          "writable": true
        },
        {
          "name": "makerPosition",
          "writable": true
        },
        {
          "name": "takerPosition",
          "writable": true
        },
        {
          "name": "makerTrader"
        },
        {
          "name": "takerTrader"
        },
        {
          "name": "engineOperatorAccount"
        },
        {
          "name": "engineAuthority"
        },
        {
          "name": "engineVaultOperator"
        },
        {
          "name": "enginePoolBalance",
          "writable": true
        },
        {
          "name": "perpVaultProgram"
        },
        {
          "name": "vaultConfig"
        },
        {
          "name": "vaultOperatorAccount"
        },
        {
          "name": "makerBalance",
          "writable": true
        },
        {
          "name": "takerBalance",
          "writable": true
        },
        {
          "name": "feeRecipientBalance",
          "writable": true
        },
        {
          "name": "makerSnapshot",
          "docs": [
            "the handler ignores it unless owner == this program AND content",
            "matches expected commit hash."
          ]
        },
        {
          "name": "takerSnapshot"
        },
        {
          "name": "instructionsSysvar",
          "address": "Sysvar1nstructions1111111111111111111111111"
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
          "name": "trade",
          "type": {
            "defined": {
              "name": "matchedTrade"
            }
          }
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
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
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
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
            "config"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "noncePage",
      "discriminator": [
        87,
        252,
        122,
        118,
        210,
        249,
        197,
        39
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
      "name": "orderSettlementConfig",
      "discriminator": [
        108,
        168,
        6,
        200,
        217,
        163,
        141,
        159
      ]
    },
    {
      "name": "orderSnapshot",
      "discriminator": [
        158,
        22,
        119,
        95,
        20,
        118,
        228,
        11
      ]
    }
  ],
  "events": [
    {
      "name": "batchSettled",
      "discriminator": [
        238,
        14,
        187,
        192,
        127,
        95,
        104,
        9
      ]
    },
    {
      "name": "dynamicSpreadApplied",
      "discriminator": [
        69,
        172,
        206,
        61,
        14,
        24,
        210,
        248
      ]
    },
    {
      "name": "dynamicSpreadTiersUpdated",
      "discriminator": [
        122,
        184,
        206,
        219,
        175,
        92,
        232,
        169
      ]
    },
    {
      "name": "dynamicSpreadUpdated",
      "discriminator": [
        203,
        28,
        65,
        172,
        114,
        182,
        150,
        20
      ]
    },
    {
      "name": "feeRecipientUpdated",
      "discriminator": [
        24,
        150,
        233,
        92,
        169,
        221,
        233,
        244
      ]
    },
    {
      "name": "feesUpdated",
      "discriminator": [
        65,
        34,
        234,
        59,
        248,
        242,
        101,
        118
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
      "name": "orderCommitted",
      "discriminator": [
        120,
        115,
        67,
        82,
        131,
        215,
        13,
        83
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
      "name": "parameterBump",
      "discriminator": [
        208,
        156,
        82,
        233,
        220,
        173,
        178,
        254
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
      "name": "timeLockUpdated",
      "discriminator": [
        213,
        6,
        236,
        221,
        30,
        73,
        57,
        83
      ]
    },
    {
      "name": "tradeSettled",
      "discriminator": [
        22,
        119,
        166,
        225,
        175,
        53,
        93,
        216
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
      "msg": "Settlement is paused"
    },
    {
      "code": 6004,
      "name": "zeroAddress",
      "msg": "Zero address"
    },
    {
      "code": 6005,
      "name": "invalidSignature",
      "msg": "Invalid signature"
    },
    {
      "code": 6006,
      "name": "missingEd25519Ix",
      "msg": "Missing ed25519 verification instruction"
    },
    {
      "code": 6007,
      "name": "ed25519MessageMismatch",
      "msg": "ed25519 instruction message mismatch"
    },
    {
      "code": 6008,
      "name": "ed25519SignerMismatch",
      "msg": "ed25519 instruction signer mismatch"
    },
    {
      "code": 6009,
      "name": "orderExpired",
      "msg": "Order expired"
    },
    {
      "code": 6010,
      "name": "orderSignedInFuture",
      "msg": "Order signed in the future"
    },
    {
      "code": 6011,
      "name": "orderTooRecent",
      "msg": "Order too recent (commit-settle delay not elapsed)"
    },
    {
      "code": 6012,
      "name": "orderTooOld",
      "msg": "Order signed too long ago"
    },
    {
      "code": 6013,
      "name": "nonceAlreadyUsed",
      "msg": "Nonce already used"
    },
    {
      "code": 6014,
      "name": "marketMismatch",
      "msg": "Market mismatch between maker and taker"
    },
    {
      "code": 6015,
      "name": "sidesNotOpposite",
      "msg": "Sides not opposite (both long or both short)"
    },
    {
      "code": 6016,
      "name": "selfTrade",
      "msg": "Self trade rejected"
    },
    {
      "code": 6017,
      "name": "zeroSize",
      "msg": "Zero size"
    },
    {
      "code": 6018,
      "name": "zeroPrice",
      "msg": "Zero price"
    },
    {
      "code": 6019,
      "name": "batchEmpty",
      "msg": "Batch is empty"
    },
    {
      "code": 6020,
      "name": "execPriceExceedsTakerLimit",
      "msg": "Execution price exceeds taker limit"
    },
    {
      "code": 6021,
      "name": "execPriceBelowTakerLimit",
      "msg": "Execution price below taker limit"
    },
    {
      "code": 6022,
      "name": "execPriceExceedsMakerLimit",
      "msg": "Execution price exceeds maker limit"
    },
    {
      "code": 6023,
      "name": "execPriceBelowMakerLimit",
      "msg": "Execution price below maker limit"
    },
    {
      "code": 6024,
      "name": "execSizeExceedsMaker",
      "msg": "Execution size exceeds maker order"
    },
    {
      "code": 6025,
      "name": "execSizeExceedsTaker",
      "msg": "Execution size exceeds taker order"
    },
    {
      "code": 6026,
      "name": "feeTooHigh",
      "msg": "Fee too high (>1000 bps)"
    },
    {
      "code": 6027,
      "name": "delayMisordered",
      "msg": "Delay misordered (max < min)"
    },
    {
      "code": 6028,
      "name": "delayTooHigh",
      "msg": "Delay exceeds maximum"
    },
    {
      "code": 6029,
      "name": "tiersNotAscending",
      "msg": "Spread tiers must be ascending"
    },
    {
      "code": 6030,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6031,
      "name": "noncePageMismatch",
      "msg": "Nonce page mismatch"
    },
    {
      "code": 6032,
      "name": "accountMismatch",
      "msg": "Account mismatch"
    },
    {
      "code": 6033,
      "name": "commitHashMismatch",
      "msg": "Commit hash mismatch"
    },
    {
      "code": 6034,
      "name": "remainingAccountsArity",
      "msg": "Remaining accounts arity invalid for batch settle"
    }
  ],
  "types": [
    {
      "name": "batchSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "batchId",
            "type": "u64"
          },
          {
            "name": "tradesCount",
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
      "name": "dynamicSpreadApplied",
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
            "name": "extraFeeBps",
            "type": "u32"
          },
          {
            "name": "skewRatioBps",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "dynamicSpreadTiersUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tier1",
            "type": "u32"
          },
          {
            "name": "tier2",
            "type": "u32"
          },
          {
            "name": "tier3",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "dynamicSpreadUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "enabled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "feeRecipientUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldRecipient",
            "type": "pubkey"
          },
          {
            "name": "newRecipient",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "feesUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "makerFeeBps",
            "type": "u32"
          },
          {
            "name": "takerFeeBps",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "matchedTrade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maker",
            "type": {
              "defined": {
                "name": "signedOrder"
              }
            }
          },
          {
            "name": "taker",
            "type": {
              "defined": {
                "name": "signedOrder"
              }
            }
          },
          {
            "name": "executionPrice",
            "type": "u64"
          },
          {
            "name": "executionSize",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "noncePage",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "pageIndex",
            "type": "u64"
          },
          {
            "name": "bits",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
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
      "name": "orderCommitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "commitHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "commitTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderSettlementConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
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
            "name": "feeRecipient",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "perpEngineProgram",
            "type": "pubkey"
          },
          {
            "name": "perpEngineConfig",
            "type": "pubkey"
          },
          {
            "name": "engineOperatorAccount",
            "type": "pubkey"
          },
          {
            "name": "perpVaultProgram",
            "type": "pubkey"
          },
          {
            "name": "perpVaultConfig",
            "type": "pubkey"
          },
          {
            "name": "vaultOperatorAccount",
            "type": "pubkey"
          },
          {
            "name": "makerFeeBps",
            "type": "u32"
          },
          {
            "name": "takerFeeBps",
            "type": "u32"
          },
          {
            "name": "minSettlementDelay",
            "type": "i64"
          },
          {
            "name": "maxSettlementDelay",
            "type": "i64"
          },
          {
            "name": "dynamicSpreadEnabled",
            "type": "bool"
          },
          {
            "name": "spreadTier1Bps",
            "type": "u32"
          },
          {
            "name": "spreadTier2Bps",
            "type": "u32"
          },
          {
            "name": "spreadTier3Bps",
            "type": "u32"
          },
          {
            "name": "batchCounter",
            "type": "u64"
          },
          {
            "name": "domainSeparator",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "clusterId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "orderSnapshot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "commitHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "commitTime",
            "type": "i64"
          },
          {
            "name": "makerFeeBps",
            "type": "u32"
          },
          {
            "name": "takerFeeBps",
            "type": "u32"
          },
          {
            "name": "minSettlementDelay",
            "type": "i64"
          },
          {
            "name": "dynamicSpreadEnabled",
            "type": "bool"
          },
          {
            "name": "spreadTier1Bps",
            "type": "u32"
          },
          {
            "name": "spreadTier2Bps",
            "type": "u32"
          },
          {
            "name": "spreadTier3Bps",
            "type": "u32"
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
      "name": "parameterBump",
      "docs": [
        "Mapping 3 prospective-only param bump.",
        "`param_id` is the sha256 of the canonical parameter name",
        "(e.g. sha256(\"OrderSettlement.makerFeeBps\")). `old_value` and",
        "`new_value` are little-endian byte encodings of the parameter",
        "(4 bytes for u32, 8 bytes for i64/u64, 1 byte for bool, or a",
        "concatenation of 3*4 bytes for the spread tier triple)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paramId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "oldValue",
            "type": "bytes"
          },
          {
            "name": "newValue",
            "type": "bytes"
          },
          {
            "name": "effectiveSlot",
            "type": "u64"
          },
          {
            "name": "admin",
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
      "name": "signedOrder",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
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
            "name": "isLong",
            "type": "bool"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "expiry",
            "type": "i64"
          },
          {
            "name": "signedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "timeLockUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newMinDelaySecs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "tradeSettled",
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
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "takerIsLong",
            "type": "bool"
          },
          {
            "name": "makerFee",
            "type": "u64"
          },
          {
            "name": "takerFee",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
