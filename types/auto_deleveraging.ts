/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/auto_deleveraging.json`.
 */
export type AutoDeleveraging = {
  "address": "6rg7CTKmrsxWLxRPApT9gkidE8i3aqJKf8AKCVgbENRf",
  "metadata": {
    "name": "autoDeleveraging",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SUR Protocol — ADL last-resort mechanism. Forcibly reduces profitable positions when insurance fund insufficient. Solana port of AutoDeleveraging.sol with manual invoke_signed CPI to perp_engine.open_position."
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
                  97,
                  100,
                  108,
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
      "name": "executeAdl",
      "discriminator": [
        215,
        162,
        171,
        194,
        70,
        177,
        146,
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
                  97,
                  100,
                  108,
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
          "name": "authority",
          "docs": [
            "Pre-registered as engine operator.",
            "Mut so it can fund init_if_needed paths inside engine."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  108,
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
          "name": "engineConfig"
        },
        {
          "name": "engineMarket",
          "writable": true
        },
        {
          "name": "enginePosition",
          "writable": true
        },
        {
          "name": "traderAccount"
        },
        {
          "name": "engineOperatorAccount"
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
          "name": "trader",
          "type": "pubkey"
        },
        {
          "name": "positionSize",
          "type": "i64"
        },
        {
          "name": "reduceSize",
          "type": "u64"
        },
        {
          "name": "markPrice",
          "type": "u64"
        },
        {
          "name": "badDebtAmount",
          "type": "u64"
        },
        {
          "name": "fundBalance",
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
                  97,
                  100,
                  108,
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
            "Pre-funded by owner with rent for downstream init_if_needed paths.",
            "Must be pre-registered as engine operator (one-time set_operator",
            "call by engine owner)."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  108,
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
          "name": "perpEngine"
        },
        {
          "name": "perpVault"
        },
        {
          "name": "insuranceFund"
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
          "name": "minBadDebtThreshold",
          "type": "u64"
        },
        {
          "name": "adlCooldownSecs",
          "type": "i64"
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
                  97,
                  100,
                  108,
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
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "setAdlEnabled",
      "discriminator": [
        213,
        29,
        148,
        38,
        169,
        239,
        241,
        192
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
                  97,
                  100,
                  108,
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
      "name": "setAdlParams",
      "discriminator": [
        114,
        5,
        64,
        71,
        97,
        156,
        150,
        233
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
                  97,
                  100,
                  108,
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
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "minBadDebtThreshold",
          "type": "u64"
        },
        {
          "name": "cooldownSecs",
          "type": "i64"
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
                  97,
                  100,
                  108,
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
                  97,
                  100,
                  108,
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
                  97,
                  100,
                  108,
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
            "config"
          ]
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "adlConfig",
      "discriminator": [
        186,
        133,
        71,
        0,
        63,
        37,
        127,
        157
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
    }
  ],
  "events": [
    {
      "name": "adlEnabledChanged",
      "discriminator": [
        70,
        52,
        244,
        253,
        243,
        118,
        17,
        216
      ]
    },
    {
      "name": "adlExecuted",
      "discriminator": [
        137,
        67,
        82,
        113,
        212,
        64,
        252,
        191
      ]
    },
    {
      "name": "adlParamsUpdated",
      "discriminator": [
        113,
        92,
        224,
        229,
        72,
        5,
        224,
        141
      ]
    },
    {
      "name": "adlTriggered",
      "discriminator": [
        150,
        241,
        47,
        168,
        46,
        246,
        183,
        253
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
      "msg": "ADL is paused"
    },
    {
      "code": 6004,
      "name": "zeroAddress",
      "msg": "Zero address"
    },
    {
      "code": 6005,
      "name": "adlDisabled",
      "msg": "ADL is disabled"
    },
    {
      "code": 6006,
      "name": "insuranceFundSufficient",
      "msg": "Insurance fund balance still above threshold"
    },
    {
      "code": 6007,
      "name": "cooldownActive",
      "msg": "Cooldown still active since last ADL event"
    },
    {
      "code": 6008,
      "name": "badDebtBelowThreshold",
      "msg": "Bad debt below activation threshold"
    },
    {
      "code": 6009,
      "name": "noPosition",
      "msg": "No position to deleverage"
    },
    {
      "code": 6010,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "adlConfig",
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
              "Bump for the adl_authority PDA — signs CPIs into perp_engine."
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
            "name": "adlEnabled",
            "type": "bool"
          },
          {
            "name": "minBadDebtThreshold",
            "docs": [
              "Min bad debt (USDC 6 decimals) before ADL can activate."
            ],
            "type": "u64"
          },
          {
            "name": "adlCooldownSecs",
            "docs": [
              "Cooldown between ADL events (seconds)."
            ],
            "type": "i64"
          },
          {
            "name": "lastAdlTime",
            "docs": [
              "Last ADL execution timestamp."
            ],
            "type": "i64"
          },
          {
            "name": "totalAdlEvents",
            "type": "u64"
          },
          {
            "name": "totalBadDebtCovered",
            "type": "u64"
          },
          {
            "name": "perpEngine",
            "docs": [
              "Program ids reserved for v0.3 CPI integration."
            ],
            "type": "pubkey"
          },
          {
            "name": "perpVault",
            "type": "pubkey"
          },
          {
            "name": "insuranceFund",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "adlEnabledChanged",
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
      "name": "adlExecuted",
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
            "name": "deleveragedTrader",
            "type": "pubkey"
          },
          {
            "name": "reducedSize",
            "type": "i64"
          },
          {
            "name": "closePrice",
            "type": "u64"
          },
          {
            "name": "badDebtCovered",
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
      "name": "adlParamsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "minBadDebtThreshold",
            "type": "u64"
          },
          {
            "name": "cooldownSecs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "adlTriggered",
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
            "name": "totalBadDebt",
            "type": "u64"
          },
          {
            "name": "insuranceFundBalance",
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
    }
  ]
};
