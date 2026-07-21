/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/a2a_darkpool.json`.
 */
export type A2aDarkpool = {
  "address": "3jPooLaiWoq5DA4SeXMfP4MT4hrp6X1zrASD9hcYqKke",
  "metadata": {
    "name": "a2aDarkpool",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "A2A Dark Pool — agent-to-agent OTC perp matching with persistent reputation. Solana port of SUR Protocol's A2ADarkPool.sol."
  },
  "instructions": [
    {
      "name": "acceptAndSettle",
      "discriminator": [
        2,
        3,
        111,
        42,
        76,
        102,
        198,
        115
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
          "name": "freshnessConfig",
          "docs": [
            "Proof-of-context freshness parameters (sidecar PDA). Must be",
            "initialized once via `init_freshness_config` before settlements run.",
            "Boxed: this context's account list is large and an unboxed account here",
            "overflows the 4 KB BPF stack frame."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  114,
                  101,
                  115,
                  104,
                  110,
                  101,
                  115,
                  115,
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
          "name": "intent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  116,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "intent.id",
                "account": "intent"
              }
            ]
          }
        },
        {
          "name": "response",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  112,
                  111,
                  110,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "response.id",
                "account": "response"
              }
            ]
          }
        },
        {
          "name": "intentCreatorReputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "intent.agent",
                "account": "intent"
              }
            ]
          }
        },
        {
          "name": "responderReputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "response.agent",
                "account": "response"
              }
            ]
          }
        },
        {
          "name": "intentCreator",
          "writable": true,
          "signer": true
        },
        {
          "name": "darkpoolAuthority",
          "docs": [
            "Mut so it can pay rent for init_if_needed positions in engine.",
            "Must be pre-funded + pre-registered as operator on both programs."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  97,
                  114,
                  107,
                  112,
                  111,
                  111,
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
          "name": "buyerPosition",
          "writable": true
        },
        {
          "name": "sellerPosition",
          "writable": true
        },
        {
          "name": "buyerTrader"
        },
        {
          "name": "sellerTrader"
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
          "name": "buyerBalance",
          "writable": true
        },
        {
          "name": "sellerBalance",
          "writable": true
        },
        {
          "name": "feeRecipientBalance",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
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
      "name": "cancelIntent",
      "discriminator": [
        67,
        73,
        238,
        244,
        208,
        89,
        225,
        59
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
          "name": "intent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  116,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "intent.id",
                "account": "intent"
              }
            ]
          }
        },
        {
          "name": "reputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agent",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelResponse",
      "discriminator": [
        24,
        134,
        17,
        237,
        161,
        162,
        94,
        141
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
          "name": "response",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  112,
                  111,
                  110,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "response.id",
                "account": "response"
              }
            ]
          }
        },
        {
          "name": "reputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "responder"
              }
            ]
          }
        },
        {
          "name": "responder",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initFreshnessConfig",
      "discriminator": [
        249,
        58,
        213,
        62,
        227,
        131,
        96,
        229
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
          "name": "freshnessConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  114,
                  101,
                  115,
                  104,
                  110,
                  101,
                  115,
                  115,
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
          "name": "maxSettlementPriceAge",
          "type": "i64"
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
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "feeRecipient",
          "docs": [
            "at settlement time once the vault program is wired in."
          ]
        },
        {
          "name": "perpEngine"
        },
        {
          "name": "perpVault"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u64"
        },
        {
          "name": "largeTradeThreshold",
          "type": "u64"
        },
        {
          "name": "largeTradeMinReputation",
          "type": "u64"
        },
        {
          "name": "minIntentDuration",
          "type": "i64"
        },
        {
          "name": "maxIntentDuration",
          "type": "i64"
        },
        {
          "name": "responseCooldown",
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
      "name": "postIntent",
      "discriminator": [
        61,
        17,
        66,
        28,
        219,
        69,
        121,
        52
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
          "name": "intent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  116,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "config.next_intent_id",
                "account": "darkPoolConfig"
              }
            ]
          }
        },
        {
          "name": "reputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "agent"
              }
            ]
          }
        },
        {
          "name": "agent",
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
          "name": "marketId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "isBuy",
          "type": "bool"
        },
        {
          "name": "size",
          "type": "u64"
        },
        {
          "name": "minPrice",
          "type": "u64"
        },
        {
          "name": "maxPrice",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "contextCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "postResponse",
      "discriminator": [
        194,
        115,
        73,
        109,
        221,
        73,
        216,
        70
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
          "name": "intent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  116,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "intent.id",
                "account": "intent"
              }
            ]
          }
        },
        {
          "name": "response",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  112,
                  111,
                  110,
                  115,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.next_response_id",
                "account": "darkPoolConfig"
              }
            ]
          }
        },
        {
          "name": "reputation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  112,
                  117,
                  116,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "responder"
              }
            ]
          }
        },
        {
          "name": "responder",
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
          "name": "price",
          "type": "u64"
        },
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "contextCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "setFeeBps",
      "discriminator": [
        2,
        161,
        245,
        141,
        111,
        32,
        39,
        198
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
          "name": "newFeeBps",
          "type": "u64"
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
          "name": "owner",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "newRecipient",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setLargeTradeMinReputation",
      "discriminator": [
        64,
        107,
        107,
        94,
        234,
        84,
        225,
        145
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
          "name": "minRep",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setLargeTradeThreshold",
      "discriminator": [
        254,
        1,
        219,
        97,
        67,
        110,
        39,
        89
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
          "name": "threshold",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setMaxSettlementPriceAge",
      "discriminator": [
        96,
        74,
        31,
        97,
        155,
        108,
        148,
        68
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
          "name": "freshnessConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  114,
                  101,
                  115,
                  104,
                  110,
                  101,
                  115,
                  115,
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
          "name": "secs",
          "type": "i64"
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
      "name": "agentReputation",
      "discriminator": [
        245,
        56,
        239,
        246,
        36,
        231,
        227,
        67
      ]
    },
    {
      "name": "darkPoolConfig",
      "discriminator": [
        147,
        30,
        227,
        106,
        130,
        184,
        204,
        12
      ]
    },
    {
      "name": "freshnessConfig",
      "discriminator": [
        34,
        141,
        78,
        69,
        201,
        131,
        181,
        6
      ]
    },
    {
      "name": "intent",
      "discriminator": [
        247,
        162,
        35,
        165,
        254,
        111,
        129,
        109
      ]
    },
    {
      "name": "response",
      "discriminator": [
        198,
        155,
        246,
        149,
        75,
        240,
        81,
        122
      ]
    }
  ],
  "events": [
    {
      "name": "a2aTradeSettled",
      "discriminator": [
        118,
        232,
        51,
        119,
        186,
        221,
        207,
        14
      ]
    },
    {
      "name": "feeBpsUpdated",
      "discriminator": [
        151,
        59,
        111,
        165,
        241,
        143,
        149,
        117
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
      "name": "freshnessBudgetUpdated",
      "discriminator": [
        30,
        93,
        162,
        37,
        211,
        252,
        171,
        52
      ]
    },
    {
      "name": "intentCancelled",
      "discriminator": [
        39,
        174,
        74,
        165,
        39,
        101,
        119,
        29
      ]
    },
    {
      "name": "intentPosted",
      "discriminator": [
        138,
        34,
        58,
        43,
        15,
        196,
        194,
        30
      ]
    },
    {
      "name": "largeTradeMinReputationUpdated",
      "discriminator": [
        238,
        51,
        76,
        4,
        72,
        232,
        167,
        112
      ]
    },
    {
      "name": "largeTradeThresholdUpdated",
      "discriminator": [
        41,
        125,
        240,
        104,
        65,
        194,
        239,
        208
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
      "name": "reputationUpdated",
      "discriminator": [
        26,
        36,
        187,
        150,
        235,
        90,
        106,
        89
      ]
    },
    {
      "name": "responseCancelled",
      "discriminator": [
        220,
        59,
        105,
        220,
        32,
        38,
        107,
        98
      ]
    },
    {
      "name": "responsePosted",
      "discriminator": [
        40,
        218,
        61,
        130,
        75,
        26,
        184,
        199
      ]
    },
    {
      "name": "settlementPreviewMode",
      "discriminator": [
        21,
        9,
        179,
        42,
        179,
        207,
        186,
        104
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
      "name": "pausedError",
      "msg": "Program is paused"
    },
    {
      "code": 6003,
      "name": "zeroAddress",
      "msg": "Zero address provided"
    },
    {
      "code": 6004,
      "name": "zeroAmount",
      "msg": "Zero amount provided"
    },
    {
      "code": 6005,
      "name": "intentExpired",
      "msg": "Intent expired"
    },
    {
      "code": 6006,
      "name": "intentNotOpen",
      "msg": "Intent not in Open status"
    },
    {
      "code": 6007,
      "name": "notIntentCreator",
      "msg": "Caller is not intent creator"
    },
    {
      "code": 6008,
      "name": "notResponseCreator",
      "msg": "Caller is not response creator"
    },
    {
      "code": 6009,
      "name": "priceOutOfRange",
      "msg": "Price out of range"
    },
    {
      "code": 6010,
      "name": "selfTrade",
      "msg": "Self trade not allowed"
    },
    {
      "code": 6011,
      "name": "insufficientReputation",
      "msg": "Insufficient reputation for this trade size"
    },
    {
      "code": 6012,
      "name": "cooldownActive",
      "msg": "Response cooldown active"
    },
    {
      "code": 6013,
      "name": "invalidPriceRange",
      "msg": "min_price > max_price"
    },
    {
      "code": 6014,
      "name": "invalidDuration",
      "msg": "Invalid duration (out of bounds)"
    },
    {
      "code": 6015,
      "name": "responseNotPending",
      "msg": "Response not in Pending status"
    },
    {
      "code": 6016,
      "name": "responseExpired",
      "msg": "Response expired"
    },
    {
      "code": 6017,
      "name": "responseIntentMismatch",
      "msg": "Response intent_id mismatch"
    },
    {
      "code": 6018,
      "name": "feeBpsTooHigh",
      "msg": "Fee bps exceeds maximum (50)"
    },
    {
      "code": 6019,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6020,
      "name": "stalePrice",
      "msg": "Market price is stale (proof-of-context f_i): now - last_price_update exceeds the freshness budget"
    },
    {
      "code": 6021,
      "name": "marketAccountMismatch",
      "msg": "engine_market account does not match the intent's market_id"
    },
    {
      "code": 6022,
      "name": "futurePrice",
      "msg": "Market price timestamp is in the future"
    },
    {
      "code": 6023,
      "name": "invalidFreshnessBudget",
      "msg": "Invalid freshness budget (must be > 0)"
    },
    {
      "code": 6024,
      "name": "invalidAccount",
      "msg": "Account does not match the canonical PDA for the resolved party/market"
    }
  ],
  "types": [
    {
      "name": "a2aTradeSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "intentId",
            "type": "u64"
          },
          {
            "name": "responseId",
            "type": "u64"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "seller",
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
            "name": "size",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "priceAsOf",
            "docs": [
              "Proof-of-context: the canonical market price vintage this trade settled",
              "against (`Market.last_price_update`), for indexer/audit."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "agentReputation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "completedTrades",
            "type": "u64"
          },
          {
            "name": "totalVolume",
            "type": "u64"
          },
          {
            "name": "expiredIntents",
            "type": "u64"
          },
          {
            "name": "cancelledResponses",
            "type": "u64"
          },
          {
            "name": "firstTradeAt",
            "type": "i64"
          },
          {
            "name": "lastTradeAt",
            "type": "i64"
          },
          {
            "name": "lastResponseTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "darkPoolConfig",
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
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "feeBps",
            "type": "u64"
          },
          {
            "name": "feeRecipient",
            "type": "pubkey"
          },
          {
            "name": "minIntentDuration",
            "type": "i64"
          },
          {
            "name": "maxIntentDuration",
            "type": "i64"
          },
          {
            "name": "responseCooldown",
            "type": "i64"
          },
          {
            "name": "largeTradeThreshold",
            "type": "u64"
          },
          {
            "name": "largeTradeMinReputation",
            "type": "u64"
          },
          {
            "name": "nextIntentId",
            "type": "u64"
          },
          {
            "name": "nextResponseId",
            "type": "u64"
          },
          {
            "name": "perpEngine",
            "type": "pubkey"
          },
          {
            "name": "perpVault",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "feeBpsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newFeeBps",
            "type": "u64"
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
            "name": "newRecipient",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "freshnessBudgetUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maxSettlementPriceAge",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "freshnessConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "maxSettlementPriceAge",
            "docs": [
              "Max age, in seconds, of the canonical market price at settlement time",
              "(`now - Market.last_price_update`). A negotiated trade whose market",
              "price is older than this does not clear (proof-of-context `f_i`)."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "intent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "agent",
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
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "minPrice",
            "type": "u64"
          },
          {
            "name": "maxPrice",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "intentStatus"
              }
            }
          },
          {
            "name": "filledResponseId",
            "type": "u64"
          },
          {
            "name": "feeBpsAtPost",
            "docs": [
              "Fee in bps snapshotted at intent post time.",
              "Mirrors Solidity Mapping 3 prospective-only convention: settlement",
              "uses this value, NOT the current config.fee_bps. Admin bumps to",
              "fee_bps do not retroactively alter fees on intents already posted."
            ],
            "type": "u64"
          },
          {
            "name": "contextCommitment",
            "docs": [
              "Proof-of-context: a 32-byte commitment to the off-chain context this",
              "agent reasoned over when forming its quote (model + input-world view).",
              "Authenticated by the agent's own tx signature at post time. `[0u8; 32]`",
              "means \"none\". Stored + emitted for binding / audit / dispute."
            ],
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
      "name": "intentCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "intentId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "intentPosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "intentId",
            "type": "u64"
          },
          {
            "name": "agent",
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
            "name": "isBuy",
            "type": "bool"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "minPrice",
            "type": "u64"
          },
          {
            "name": "maxPrice",
            "type": "u64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "contextCommitment",
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
      "name": "intentStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "filled"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "largeTradeMinReputationUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newMinReputation",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "largeTradeThresholdUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newThreshold",
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
      "name": "reputationUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "newScore",
            "type": "u64"
          },
          {
            "name": "completedTrades",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "response",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "intentId",
            "type": "u64"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "responseStatus"
              }
            }
          },
          {
            "name": "contextCommitment",
            "docs": [
              "Proof-of-context commitment for this quote (see `Intent::context_commitment`)."
            ],
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
      "name": "responseCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "responseId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "responsePosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "responseId",
            "type": "u64"
          },
          {
            "name": "intentId",
            "type": "u64"
          },
          {
            "name": "responder",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "contextCommitment",
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
      "name": "responseStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "accepted"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "expired"
          }
        ]
      }
    },
    {
      "name": "settlementPreviewMode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "intentId",
            "type": "u64"
          },
          {
            "name": "responseId",
            "type": "u64"
          },
          {
            "name": "feePerSideUncollected",
            "type": "u64"
          },
          {
            "name": "note",
            "type": "string"
          }
        ]
      }
    }
  ]
};
