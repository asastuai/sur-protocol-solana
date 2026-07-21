/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/trading_vault.json`.
 */
export type TradingVault = {
  "address": "aMYTJ33dzuTXXHpRSAp9UsR5jogu7sdJUDtVrSx9bjT",
  "metadata": {
    "name": "tradingVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SUR Protocol — TradingVault. Pooled HLP-style trading vaults: depositors share manager PnL pro-rata. Solana port of TradingVault.sol."
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
      "name": "createVault",
      "discriminator": [
        29,
        237,
        247,
        208,
        193,
        82,
        54,
        135
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
          "name": "vault",
          "writable": true,
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
                "kind": "arg",
                "path": "vaultId"
              }
            ]
          }
        },
        {
          "name": "manager",
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
          "name": "vaultId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "name",
          "type": "bytes"
        },
        {
          "name": "description",
          "type": "bytes"
        },
        {
          "name": "performanceFeeBps",
          "type": "u64"
        },
        {
          "name": "managementFeeBps",
          "type": "u64"
        },
        {
          "name": "depositCap",
          "type": "u64"
        },
        {
          "name": "lockupPeriodSecs",
          "type": "i64"
        },
        {
          "name": "maxDrawdownBps",
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
          "name": "vault",
          "writable": true,
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
                "path": "vault.id",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "depositorAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault.id",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "depositor",
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
                  116,
                  114,
                  97,
                  100,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
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
          "name": "perpVaultProgram"
        },
        {
          "name": "perpVaultConfig"
        },
        {
          "name": "vaultOperatorAccount"
        },
        {
          "name": "depositorBalance",
          "writable": true
        },
        {
          "name": "vaultBalance",
          "writable": true
        },
        {
          "name": "managerBalance",
          "writable": true
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
      "name": "emergencyPause",
      "discriminator": [
        21,
        143,
        27,
        142,
        200,
        181,
        210,
        255
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
          "name": "vault",
          "writable": true,
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
                "path": "vault.id",
                "account": "vault"
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
      "name": "initVaultBalance",
      "discriminator": [
        221,
        120,
        254,
        72,
        89,
        93,
        13,
        149
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
          "name": "vault",
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
                "path": "vault.id",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "payer",
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
                  116,
                  114,
                  97,
                  100,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
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
          "name": "perpVaultProgram"
        },
        {
          "name": "perpVaultConfig",
          "writable": true
        },
        {
          "name": "vaultOperatorAccount"
        },
        {
          "name": "vaultBalance",
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
            "can pay rent for init_if_needed AccountBalance + Position PDAs at the",
            "callee programs. Must be pre-registered as operator on perp_vault and",
            "perp_engine before any deposit/trade."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  97,
                  100,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
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
          "name": "perpVaultProgram"
        },
        {
          "name": "perpVaultConfig"
        },
        {
          "name": "vaultOperatorAccount"
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
      "name": "managerClosePosition",
      "discriminator": [
        115,
        182,
        8,
        24,
        138,
        59,
        185,
        25
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
          "name": "vault",
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
                "path": "vault.id",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "manager",
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
                  116,
                  114,
                  97,
                  100,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
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
          "name": "engineMarket",
          "writable": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "engineOperatorAccount"
        },
        {
          "name": "engineAuthority"
        },
        {
          "name": "perpVaultProgram"
        },
        {
          "name": "perpVaultConfig"
        },
        {
          "name": "engineVaultOperator"
        },
        {
          "name": "vaultBalance",
          "writable": true
        },
        {
          "name": "enginePoolBalance",
          "writable": true
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
          "name": "fillPrice",
          "type": "u64"
        }
      ]
    },
    {
      "name": "managerOpenPosition",
      "discriminator": [
        194,
        54,
        96,
        132,
        68,
        119,
        150,
        89
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
          "name": "vault",
          "writable": true,
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
                "path": "vault.id",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "manager",
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
                  116,
                  114,
                  97,
                  100,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
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
          "name": "engineMarket",
          "writable": true
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "engineOperatorAccount"
        },
        {
          "name": "vaultBalance",
          "docs": [
            "equity read AND src_balance for engine's margin-lock CPI (v0.3.1)."
          ],
          "writable": true
        },
        {
          "name": "engineAuthority"
        },
        {
          "name": "perpVaultProgram"
        },
        {
          "name": "perpVaultConfig"
        },
        {
          "name": "engineVaultOperator"
        },
        {
          "name": "enginePoolBalance",
          "writable": true
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
      "name": "setDrawdownCooldownSecs",
      "discriminator": [
        61,
        191,
        24,
        225,
        229,
        116,
        215,
        253
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
          "name": "newSecs",
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
      "name": "unpauseVault",
      "discriminator": [
        125,
        29,
        213,
        213,
        114,
        155,
        125,
        63
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
          "name": "vault",
          "writable": true,
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
                "path": "vault.id",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "manager",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "updateVaultSafetyLimits",
      "discriminator": [
        177,
        251,
        65,
        166,
        18,
        51,
        26,
        193
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
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
                "path": "vault.id",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "manager",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "newDepositCap",
          "type": "u64"
        },
        {
          "name": "newLockupPeriodSecs",
          "type": "i64"
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
          "name": "vault",
          "writable": true,
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
                "path": "vault.id",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "depositorAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault.id",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "depositor"
              }
            ]
          }
        },
        {
          "name": "depositor",
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
                  116,
                  114,
                  97,
                  100,
                  105,
                  110,
                  103,
                  95,
                  118,
                  97,
                  117,
                  108,
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
          "name": "perpVaultProgram"
        },
        {
          "name": "perpVaultConfig"
        },
        {
          "name": "vaultOperatorAccount"
        },
        {
          "name": "depositorBalance",
          "writable": true
        },
        {
          "name": "vaultBalance",
          "writable": true
        },
        {
          "name": "managerBalance",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u128"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "depositor",
      "discriminator": [
        219,
        74,
        92,
        245,
        101,
        149,
        45,
        97
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
      "name": "tradingVaultConfig",
      "discriminator": [
        108,
        70,
        85,
        164,
        67,
        203,
        26,
        176
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "drawdownCooldownUpdated",
      "discriminator": [
        240,
        252,
        54,
        166,
        134,
        31,
        213,
        57
      ]
    },
    {
      "name": "managementFeeCollected",
      "discriminator": [
        67,
        171,
        32,
        236,
        46,
        47,
        217,
        215
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
      "name": "performanceFeeCollected",
      "discriminator": [
        191,
        234,
        88,
        82,
        38,
        224,
        78,
        126
      ]
    },
    {
      "name": "vaultCreated",
      "discriminator": [
        117,
        25,
        120,
        254,
        75,
        236,
        78,
        115
      ]
    },
    {
      "name": "vaultDeposit",
      "discriminator": [
        4,
        248,
        234,
        163,
        99,
        238,
        140,
        45
      ]
    },
    {
      "name": "vaultPauseChanged",
      "discriminator": [
        60,
        211,
        15,
        230,
        20,
        200,
        83,
        133
      ]
    },
    {
      "name": "vaultSafetyLimitsUpdated",
      "discriminator": [
        221,
        32,
        27,
        182,
        191,
        97,
        198,
        168
      ]
    },
    {
      "name": "vaultTradeExecuted",
      "discriminator": [
        204,
        197,
        254,
        117,
        78,
        15,
        175,
        187
      ]
    },
    {
      "name": "vaultWithdraw",
      "discriminator": [
        133,
        90,
        194,
        198,
        170,
        52,
        90,
        180
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notManager",
      "msg": "Caller is not manager"
    },
    {
      "code": 6001,
      "name": "notOwner",
      "msg": "Caller is not owner"
    },
    {
      "code": 6002,
      "name": "notPendingOwner",
      "msg": "Caller is not pending owner"
    },
    {
      "code": 6003,
      "name": "notOperator",
      "msg": "Caller is not authorized operator"
    },
    {
      "code": 6004,
      "name": "vaultPausedError",
      "msg": "Vault is paused"
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
      "name": "insufficientShares",
      "msg": "Insufficient shares"
    },
    {
      "code": 6008,
      "name": "lockupNotExpired",
      "msg": "Lockup not expired"
    },
    {
      "code": 6009,
      "name": "depositCapExceeded",
      "msg": "Deposit cap exceeded"
    },
    {
      "code": 6010,
      "name": "maxDrawdownBreached",
      "msg": "Max drawdown breached"
    },
    {
      "code": 6011,
      "name": "vaultAlreadyExists",
      "msg": "Vault already exists"
    },
    {
      "code": 6012,
      "name": "vaultNotFound",
      "msg": "Vault not found"
    },
    {
      "code": 6013,
      "name": "invalidFees",
      "msg": "Invalid fees"
    },
    {
      "code": 6014,
      "name": "invalidDrawdownLimit",
      "msg": "Invalid drawdown limit"
    },
    {
      "code": 6015,
      "name": "drawdownCooldownActive",
      "msg": "Drawdown cooldown still active"
    },
    {
      "code": 6016,
      "name": "minFirstDepositNotMet",
      "msg": "Minimum first deposit not met (1000 USDC)"
    },
    {
      "code": 6017,
      "name": "depositTooSmall",
      "msg": "Deposit too small to issue shares"
    },
    {
      "code": 6018,
      "name": "nameTooLong",
      "msg": "Name too long"
    },
    {
      "code": 6019,
      "name": "descriptionTooLong",
      "msg": "Description too long"
    },
    {
      "code": 6020,
      "name": "invalidEquity",
      "msg": "Equity passed to instruction is invalid"
    },
    {
      "code": 6021,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6022,
      "name": "incompletePositionSet",
      "msg": "Position set does not match the vault's open-market registry"
    },
    {
      "code": 6023,
      "name": "duplicatePosition",
      "msg": "Duplicate position in the equity set"
    },
    {
      "code": 6024,
      "name": "unregisteredPosition",
      "msg": "Position market is not registered for this vault"
    },
    {
      "code": 6025,
      "name": "tooManyMarkets",
      "msg": "Vault has reached the maximum number of markets"
    }
  ],
  "types": [
    {
      "name": "depositor",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u128"
          },
          {
            "name": "depositTimestamp",
            "type": "i64"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalWithdrawn",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "drawdownCooldownUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldSecs",
            "type": "i64"
          },
          {
            "name": "newSecs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "managementFeeCollected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "amount",
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
      "name": "performanceFeeCollected",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "tradingVaultConfig",
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
            "name": "drawdownCooldownSecs",
            "type": "i64"
          },
          {
            "name": "vaultCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "id",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "manager",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "totalShares",
            "type": "u128"
          },
          {
            "name": "totalDeposited",
            "type": "u64"
          },
          {
            "name": "totalWithdrawn",
            "type": "u64"
          },
          {
            "name": "performanceFeeBps",
            "type": "u64"
          },
          {
            "name": "managementFeeBps",
            "type": "u64"
          },
          {
            "name": "highWaterMark",
            "type": "u128"
          },
          {
            "name": "lastFeeAccrual",
            "type": "i64"
          },
          {
            "name": "depositCap",
            "type": "u64"
          },
          {
            "name": "lockupPeriodSecs",
            "type": "i64"
          },
          {
            "name": "maxDrawdownBps",
            "type": "u64"
          },
          {
            "name": "drawdownPausedAt",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "nameLen",
            "type": "u8"
          },
          {
            "name": "name",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "descriptionLen",
            "type": "u16"
          },
          {
            "name": "description",
            "type": {
              "array": [
                "u8",
                256
              ]
            }
          },
          {
            "name": "openMarketsLen",
            "docs": [
              "CRITICAL-1 fix (2026-07-21 audit): registry of market_ids the vault has ever",
              "opened a position in (add-only), stored as `open_markets_len` 32-byte chunks.",
              "compute_vault_equity requires the caller to pass the canonical Position for",
              "EVERY entry — closing the equity-set forgery (omit losers / duplicate winners)."
            ],
            "type": "u8"
          },
          {
            "name": "openMarkets",
            "type": {
              "array": [
                "u8",
                512
              ]
            }
          }
        ]
      }
    },
    {
      "name": "vaultCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "manager",
            "type": "pubkey"
          },
          {
            "name": "performanceFeeBps",
            "type": "u64"
          },
          {
            "name": "managementFeeBps",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultDeposit",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "usdcAmount",
            "type": "u64"
          },
          {
            "name": "sharesIssued",
            "type": "u128"
          },
          {
            "name": "equityAtTime",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultPauseChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isPaused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "vaultSafetyLimitsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "depositCap",
            "type": "u64"
          },
          {
            "name": "lockupPeriodSecs",
            "type": "i64"
          },
          {
            "name": "maxDrawdownBps",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultTradeExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
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
            "name": "sizeDelta",
            "type": "i64"
          },
          {
            "name": "price",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vaultWithdraw",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "depositor",
            "type": "pubkey"
          },
          {
            "name": "sharesBurned",
            "type": "u128"
          },
          {
            "name": "usdcReturned",
            "type": "u64"
          },
          {
            "name": "equityAtTime",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
