/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/collateral_manager.json`.
 */
export type CollateralManager = {
  "address": "CzsxUSohWydLesZ2nfAa7WqpiZfWhZkWUHhBMkFS29VU",
  "metadata": {
    "name": "collateralManager",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SUR Protocol — CollateralManager. Yield-bearing token margin: SPL custody, haircut-adjusted USDC credit via perp_vault CPI, prospective haircut snapshots. Solana port of CollateralManager.sol."
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
      "name": "addCollateral",
      "discriminator": [
        127,
        82,
        121,
        42,
        161,
        176,
        249,
        206
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
          "name": "mint"
        },
        {
          "name": "collateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "mint"
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
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "symbol",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "haircutBps",
          "type": "u64"
        },
        {
          "name": "initialPrice",
          "type": "u64"
        },
        {
          "name": "maxPriceAge",
          "type": "i64"
        },
        {
          "name": "depositCap",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
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
          "name": "collateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "traderToken",
          "writable": true
        },
        {
          "name": "traderCollateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "docs": [
            "Mut so it can pay rent for init_if_needed AccountBalance at vault."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114,
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
          "name": "vaultProgram"
        },
        {
          "name": "vaultConfig",
          "writable": true
        },
        {
          "name": "vaultOperatorAccount"
        },
        {
          "name": "traderBalance",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
            "(CollateralOp creates AccountBalance with payer = operator). Must be",
            "pre-registered as operator on perp_vault."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114,
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
          "name": "vaultProgram"
        },
        {
          "name": "vaultConfig"
        },
        {
          "name": "vaultOperatorAccount"
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
          "name": "liquidationThresholdBps",
          "type": "u64"
        },
        {
          "name": "maxPriceDeviationBps",
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
      "name": "pauseCollateral",
      "discriminator": [
        11,
        51,
        4,
        126,
        30,
        129,
        233,
        9
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
          "name": "collateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "collateral.mint",
                "account": "collateralConfig"
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
      "name": "setLiquidationThresholdBps",
      "discriminator": [
        240,
        171,
        134,
        1,
        231,
        151,
        240,
        201
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
          "name": "newThreshold",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setMaxPriceDeviationBps",
      "discriminator": [
        13,
        166,
        196,
        104,
        129,
        190,
        209,
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
          "name": "owner",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "newBps",
          "type": "u64"
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
    },
    {
      "name": "unpauseCollateral",
      "discriminator": [
        245,
        174,
        45,
        201,
        186,
        194,
        172,
        112
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
          "name": "collateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "collateral.mint",
                "account": "collateralConfig"
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
      "name": "updateHaircut",
      "discriminator": [
        192,
        119,
        20,
        109,
        23,
        23,
        220,
        117
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
          "name": "collateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "collateral.mint",
                "account": "collateralConfig"
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
          "name": "newHaircut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updatePrice",
      "discriminator": [
        61,
        34,
        117,
        155,
        75,
        34,
        123,
        208
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
          "name": "collateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "collateral.mint",
                "account": "collateralConfig"
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
          "name": "operator",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "newPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
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
          "name": "collateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "escrow",
          "writable": true
        },
        {
          "name": "escrowAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "traderToken",
          "writable": true
        },
        {
          "name": "traderCollateral",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  112,
                  111,
                  115,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              },
              {
                "kind": "account",
                "path": "trader"
              }
            ]
          }
        },
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "authority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  109,
                  97,
                  110,
                  97,
                  103,
                  101,
                  114,
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
          "name": "vaultProgram"
        },
        {
          "name": "vaultConfig",
          "writable": true
        },
        {
          "name": "vaultOperatorAccount"
        },
        {
          "name": "traderBalance",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
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
    }
  ],
  "accounts": [
    {
      "name": "collateralConfig",
      "discriminator": [
        150,
        147,
        210,
        201,
        79,
        202,
        93,
        49
      ]
    },
    {
      "name": "collateralManagerConfig",
      "discriminator": [
        219,
        252,
        31,
        41,
        23,
        155,
        26,
        24
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
      "name": "traderCollateral",
      "discriminator": [
        200,
        54,
        193,
        30,
        21,
        249,
        3,
        210
      ]
    }
  ],
  "events": [
    {
      "name": "collateralAdded",
      "discriminator": [
        172,
        68,
        58,
        249,
        157,
        64,
        74,
        141
      ]
    },
    {
      "name": "collateralDeposited",
      "discriminator": [
        244,
        62,
        77,
        11,
        135,
        112,
        61,
        96
      ]
    },
    {
      "name": "collateralHaircutUpdated",
      "discriminator": [
        123,
        204,
        239,
        190,
        105,
        39,
        121,
        222
      ]
    },
    {
      "name": "collateralLiquidated",
      "discriminator": [
        148,
        42,
        28,
        104,
        72,
        50,
        124,
        98
      ]
    },
    {
      "name": "collateralPauseChanged",
      "discriminator": [
        36,
        161,
        63,
        173,
        105,
        124,
        121,
        248
      ]
    },
    {
      "name": "collateralPriceUpdated",
      "discriminator": [
        196,
        152,
        222,
        48,
        83,
        150,
        54,
        2
      ]
    },
    {
      "name": "collateralWithdrawn",
      "discriminator": [
        51,
        224,
        133,
        106,
        74,
        173,
        72,
        82
      ]
    },
    {
      "name": "liquidationThresholdUpdated",
      "discriminator": [
        52,
        47,
        100,
        162,
        227,
        140,
        232,
        216
      ]
    },
    {
      "name": "maxPriceDeviationUpdated",
      "discriminator": [
        207,
        70,
        196,
        66,
        236,
        15,
        86,
        63
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
      "msg": "Caller is not authorized operator"
    },
    {
      "code": 6003,
      "name": "pausedError",
      "msg": "CollateralManager is paused"
    },
    {
      "code": 6004,
      "name": "zeroAddress",
      "msg": "Zero address"
    },
    {
      "code": 6005,
      "name": "zeroAmount",
      "msg": "Zero amount"
    },
    {
      "code": 6006,
      "name": "collateralNotSupported",
      "msg": "Collateral not supported"
    },
    {
      "code": 6007,
      "name": "collateralAlreadyExists",
      "msg": "Collateral already exists"
    },
    {
      "code": 6008,
      "name": "collateralPausedError",
      "msg": "Collateral paused"
    },
    {
      "code": 6009,
      "name": "insufficientCollateral",
      "msg": "Insufficient collateral"
    },
    {
      "code": 6010,
      "name": "stalePrice",
      "msg": "Stale price"
    },
    {
      "code": 6011,
      "name": "futureTimestamp",
      "msg": "Future timestamp"
    },
    {
      "code": 6012,
      "name": "haircutInvalid",
      "msg": "Haircut bps invalid"
    },
    {
      "code": 6013,
      "name": "thresholdInvalid",
      "msg": "Liquidation threshold invalid"
    },
    {
      "code": 6014,
      "name": "deviationInvalid",
      "msg": "Deviation bps invalid"
    },
    {
      "code": 6015,
      "name": "priceDeviationTooHigh",
      "msg": "Price deviation too high"
    },
    {
      "code": 6016,
      "name": "depositCapExceeded",
      "msg": "Deposit cap exceeded"
    },
    {
      "code": 6017,
      "name": "depositTooSmall",
      "msg": "Deposit too small for credit"
    },
    {
      "code": 6018,
      "name": "symbolTooLong",
      "msg": "Symbol too long (max 16 bytes)"
    },
    {
      "code": 6019,
      "name": "notUndercollateralized",
      "msg": "Position is not undercollateralized"
    },
    {
      "code": 6020,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "collateralAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "haircutBps",
            "type": "u64"
          },
          {
            "name": "decimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "collateralConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "escrowAuthorityBump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "escrow",
            "type": "pubkey"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "haircutBps",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "lastPriceUpdate",
            "type": "i64"
          },
          {
            "name": "maxPriceAge",
            "type": "i64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "depositCap",
            "type": "u64"
          },
          {
            "name": "symbol",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "collateralDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "creditedUsdc",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "collateralHaircutUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "oldHaircut",
            "type": "u64"
          },
          {
            "name": "newHaircut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "collateralLiquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "usdcDebit",
            "type": "u64"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "collateralManagerConfig",
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
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "vaultProgram",
            "type": "pubkey"
          },
          {
            "name": "vaultConfig",
            "type": "pubkey"
          },
          {
            "name": "vaultOperatorAccount",
            "type": "pubkey"
          },
          {
            "name": "liquidationThresholdBps",
            "type": "u64"
          },
          {
            "name": "maxPriceDeviationBps",
            "type": "u64"
          },
          {
            "name": "supportedTokenCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "collateralPauseChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "collateralPriceUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "price",
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
      "name": "collateralWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "debitedUsdc",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidationThresholdUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldThreshold",
            "type": "u64"
          },
          {
            "name": "newThreshold",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "maxPriceDeviationUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldBps",
            "type": "u64"
          },
          {
            "name": "newBps",
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
            "name": "oldOwner",
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
        "Mapping 3 — every prospective-only param bump emits this."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paramId",
            "docs": [
              "keccak-equivalent: sha256 of canonical name (per-token where applicable)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "oldValue",
            "type": "u64"
          },
          {
            "name": "newValue",
            "type": "u64"
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
      "name": "traderCollateral",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "creditedUsdc",
            "type": "u64"
          },
          {
            "name": "haircutAtDeposit",
            "docs": [
              "Haircut bps snapshotted on transition empty -> non-empty. Reset when",
              "position fully closes. Mapping 3 prospective-only semantics."
            ],
            "type": "u64"
          },
          {
            "name": "liquidationThresholdAtDeposit",
            "docs": [
              "Liquidation threshold bps snapshotted at the same moment."
            ],
            "type": "u64"
          }
        ]
      }
    }
  ]
};
