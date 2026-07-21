/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/oracle_router.json`.
 */
export type OracleRouter = {
  "address": "D9WVUxHXmH8y3yB6N6aA8MBytiKY7noG2RG2PdHPqMBx",
  "metadata": {
    "name": "oracleRouter",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SUR Protocol — OracleRouter. Solana port of OracleRouter.sol. Validates price updates with staleness, confidence, deviation, and circuit-breaker rules; pushes mark+index prices to perp_engine. v0.2 ships with operator-pushed prices (Pyth-account integration deferred to v0.2.X)."
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
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
      "name": "configureFeed",
      "discriminator": [
        148,
        186,
        157,
        93,
        231,
        55,
        200,
        6
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
          "name": "feed",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  100
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
            "oracleConfig"
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
          "name": "pythFeed",
          "type": "pubkey"
        },
        {
          "name": "maxStalenessSeconds",
          "type": "i64"
        },
        {
          "name": "maxDeviationBps",
          "type": "u64"
        },
        {
          "name": "maxConfidenceBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deactivateFeed",
      "discriminator": [
        182,
        149,
        189,
        108,
        44,
        58,
        204,
        154
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
          "name": "feed",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "oracleConfig"
          ]
        }
      ],
      "args": []
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
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
          "name": "cooldownSecs",
          "type": "i64"
        },
        {
          "name": "maxPriceChangeBps",
          "type": "u64"
        },
        {
          "name": "requiredGoodPricesForReset",
          "type": "u64"
        }
      ]
    },
    {
      "name": "pushPrice",
      "discriminator": [
        113,
        238,
        232,
        235,
        60,
        71,
        127,
        203
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
          "name": "feed",
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
        },
        {
          "name": "oracleAuthority",
          "docs": [
            "Must be pre-registered as operator on perp_engine for the CPI to succeed."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
          "name": "engineOperatorAccount"
        }
      ],
      "args": [
        {
          "name": "markPrice",
          "type": "u64"
        },
        {
          "name": "indexPrice",
          "type": "u64"
        },
        {
          "name": "source",
          "type": "u8"
        },
        {
          "name": "publishTimestamp",
          "type": "i64"
        },
        {
          "name": "confidenceBps",
          "type": "u64"
        }
      ]
    },
    {
      "name": "resetCircuitBreaker",
      "discriminator": [
        225,
        48,
        84,
        136,
        90,
        146,
        26,
        149
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
            "oracleConfig"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "setCircuitBreakerParams",
      "discriminator": [
        64,
        193,
        56,
        46,
        51,
        224,
        112,
        230
      ],
      "accounts": [
        {
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
            "oracleConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "cooldownSecs",
          "type": "i64"
        },
        {
          "name": "maxChangeBps",
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
          "name": "oracleConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
            "oracleConfig"
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
          "name": "oracleConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  97,
                  99,
                  108,
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
            "oracleConfig"
          ]
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "feedConfig",
      "discriminator": [
        75,
        97,
        12,
        15,
        89,
        221,
        78,
        71
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
      "name": "oracleConfig",
      "discriminator": [
        133,
        196,
        152,
        50,
        27,
        21,
        145,
        254
      ]
    }
  ],
  "events": [
    {
      "name": "deviationWarning",
      "discriminator": [
        17,
        243,
        194,
        250,
        169,
        243,
        94,
        167
      ]
    },
    {
      "name": "feedConfigured",
      "discriminator": [
        18,
        23,
        81,
        38,
        11,
        227,
        187,
        164
      ]
    },
    {
      "name": "feedDeactivated",
      "discriminator": [
        82,
        150,
        135,
        228,
        218,
        82,
        248,
        115
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
      "name": "oracleCircuitBreakerReset",
      "discriminator": [
        253,
        84,
        6,
        212,
        152,
        42,
        144,
        100
      ]
    },
    {
      "name": "oracleCircuitBreakerTriggered",
      "discriminator": [
        133,
        204,
        251,
        99,
        50,
        221,
        143,
        230
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
      "name": "pricePushPreviewMode",
      "discriminator": [
        8,
        58,
        113,
        190,
        180,
        116,
        108,
        198
      ]
    },
    {
      "name": "priceUpdated",
      "discriminator": [
        154,
        72,
        87,
        150,
        246,
        230,
        23,
        217
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
      "name": "zeroAddress",
      "msg": "Zero address provided"
    },
    {
      "code": 6004,
      "name": "feedNotConfigured",
      "msg": "Feed not configured for this market"
    },
    {
      "code": 6005,
      "name": "priceStale",
      "msg": "Price is stale (older than max_staleness_seconds)"
    },
    {
      "code": 6006,
      "name": "priceNegativeOrZero",
      "msg": "Price is negative or zero"
    },
    {
      "code": 6007,
      "name": "priceDeviationTooHigh",
      "msg": "Price deviation between sources exceeds max"
    },
    {
      "code": 6008,
      "name": "confidenceTooWide",
      "msg": "Pyth confidence interval too wide"
    },
    {
      "code": 6009,
      "name": "oracleCircuitBreakerActive",
      "msg": "Oracle circuit breaker is active"
    },
    {
      "code": 6010,
      "name": "invalidCooldown",
      "msg": "Invalid cooldown (must be in [60, 86400] seconds)"
    },
    {
      "code": 6011,
      "name": "invalidMaxChangeBps",
      "msg": "Invalid max_price_change_bps (must be in [100, 10000])"
    },
    {
      "code": 6012,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6013,
      "name": "futureTimestamp",
      "msg": "Future timestamp not allowed"
    }
  ],
  "types": [
    {
      "name": "deviationWarning",
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
            "name": "primaryPrice",
            "type": "u64"
          },
          {
            "name": "secondaryPrice",
            "type": "u64"
          },
          {
            "name": "deviationBps",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "feedConfig",
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
            "name": "pythFeed",
            "docs": [
              "Pyth price feed account on Solana (set to default Pubkey to use external operator price)."
            ],
            "type": "pubkey"
          },
          {
            "name": "maxStalenessSeconds",
            "type": "i64"
          },
          {
            "name": "maxDeviationBps",
            "docs": [
              "Max allowed deviation between Pyth and a secondary source (Switchboard later).",
              "Currently informational; activated when secondary source lands in v0.2.X."
            ],
            "type": "u64"
          },
          {
            "name": "maxConfidenceBps",
            "docs": [
              "Max Pyth confidence interval as % of price."
            ],
            "type": "u64"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "lastPrice",
            "docs": [
              "Last pushed price (mark) + timestamp for change-detection + CB."
            ],
            "type": "u64"
          },
          {
            "name": "lastPriceTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "feedConfigured",
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
            "name": "pythFeed",
            "type": "pubkey"
          },
          {
            "name": "maxStalenessSeconds",
            "type": "i64"
          },
          {
            "name": "maxDeviationBps",
            "type": "u64"
          },
          {
            "name": "maxConfidenceBps",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "feedDeactivated",
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
      "name": "oracleCircuitBreakerReset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "oracleCircuitBreakerTriggered",
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
            "name": "changeBps",
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
      "name": "oracleConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
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
            "name": "circuitBreakerActive",
            "docs": [
              "Whether trading should pause due to oracle anomaly."
            ],
            "type": "bool"
          },
          {
            "name": "circuitBreakerTriggeredAt",
            "type": "i64"
          },
          {
            "name": "cooldownSecs",
            "type": "i64"
          },
          {
            "name": "maxPriceChangeBps",
            "docs": [
              "Max price change per update in BPS — larger moves trigger CB."
            ],
            "type": "u64"
          },
          {
            "name": "goodPriceCountAfterCb",
            "docs": [
              "Required consecutive good prices before auto-resetting CB (M-17 fix preserved)."
            ],
            "type": "u64"
          },
          {
            "name": "requiredGoodPricesForReset",
            "type": "u64"
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
      "name": "pricePushPreviewMode",
      "docs": [
        "v0.2 stub-mode marker (mirrors SettlementPreviewMode in a2a_darkpool).",
        "Indexers should flag `PriceUpdated` events paired with this marker as",
        "not-yet-pushed-to-engine, since perp_engine CPI lands in v0.2.X."
      ],
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
            "name": "markPrice",
            "type": "u64"
          },
          {
            "name": "indexPrice",
            "type": "u64"
          },
          {
            "name": "note",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "priceUpdated",
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
            "name": "markPrice",
            "type": "u64"
          },
          {
            "name": "indexPrice",
            "type": "u64"
          },
          {
            "name": "source",
            "type": "u8"
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
