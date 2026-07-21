/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sur_timelock.json`.
 */
export type SurTimelock = {
  "address": "8VRBi4s3D12Y7sbUYLSmsCGLDnj6xAVSNL1KfhYiCnUw",
  "metadata": {
    "name": "surTimelock",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "SUR Protocol — Timelock controller. Enforces a delay on admin operations except emergency pause. Solana port of SurTimelock.sol with Solana-native instruction queueing (raw EVM target.call(bytes) semantics replaced with structured QueuedTx PDA + invoke_signed at execute)."
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
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
      "name": "cancelTransaction",
      "discriminator": [
        65,
        191,
        19,
        127,
        230,
        26,
        214,
        142
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "queued",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "completeSetup",
      "discriminator": [
        38,
        166,
        253,
        14,
        86,
        87,
        132,
        62
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
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "pausableTarget",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  117,
                  115,
                  97,
                  98,
                  108,
                  101,
                  95,
                  116,
                  97,
                  114,
                  103,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pausable_target.target",
                "account": "pausableTarget"
              }
            ]
          }
        },
        {
          "name": "guardian",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "executeTransaction",
      "discriminator": [
        231,
        173,
        49,
        91,
        235,
        24,
        68,
        19
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "queued",
          "writable": true
        },
        {
          "name": "authority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "instructionData",
          "type": "bytes"
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
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "guardian"
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
          "name": "delay",
          "type": "i64"
        }
      ]
    },
    {
      "name": "queueTransaction",
      "discriminator": [
        0,
        142,
        229,
        190,
        90,
        141,
        38,
        5
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "queued",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  117,
                  101,
                  100,
                  95,
                  116,
                  120
                ]
              },
              {
                "kind": "arg",
                "path": "txHash"
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
          "name": "txHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "target",
          "type": "pubkey"
        },
        {
          "name": "instructionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "accountsHash",
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
      "name": "setDelay",
      "discriminator": [
        252,
        122,
        2,
        67,
        127,
        181,
        249,
        124
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
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "newDelay",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setGuardian",
      "discriminator": [
        147,
        243,
        50,
        121,
        154,
        164,
        50,
        30
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
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "newGuardian",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setPausableTarget",
      "discriminator": [
        163,
        1,
        216,
        89,
        192,
        211,
        60,
        48
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
          "name": "pausableTarget",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  117,
                  115,
                  97,
                  98,
                  108,
                  101,
                  95,
                  116,
                  97,
                  114,
                  103,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "target"
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
          "name": "target",
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
                  116,
                  105,
                  109,
                  101,
                  108,
                  111,
                  99,
                  107,
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
    }
  ],
  "accounts": [
    {
      "name": "pausableTarget",
      "discriminator": [
        15,
        227,
        66,
        164,
        98,
        52,
        69,
        12
      ]
    },
    {
      "name": "queuedTx",
      "discriminator": [
        230,
        89,
        179,
        29,
        212,
        136,
        200,
        173
      ]
    },
    {
      "name": "timelockConfig",
      "discriminator": [
        189,
        87,
        27,
        18,
        189,
        173,
        47,
        197
      ]
    }
  ],
  "events": [
    {
      "name": "delayUpdated",
      "discriminator": [
        233,
        5,
        196,
        236,
        158,
        119,
        26,
        239
      ]
    },
    {
      "name": "emergencyPause",
      "discriminator": [
        105,
        91,
        187,
        159,
        198,
        176,
        189,
        87
      ]
    },
    {
      "name": "guardianUpdated",
      "discriminator": [
        31,
        95,
        81,
        24,
        90,
        9,
        246,
        32
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
      "name": "pausableTargetUpdated",
      "discriminator": [
        138,
        39,
        86,
        166,
        208,
        13,
        88,
        75
      ]
    },
    {
      "name": "setupCompleted",
      "discriminator": [
        212,
        62,
        50,
        74,
        107,
        219,
        91,
        95
      ]
    },
    {
      "name": "txCancelled",
      "discriminator": [
        52,
        45,
        85,
        84,
        84,
        42,
        7,
        219
      ]
    },
    {
      "name": "txExecuted",
      "discriminator": [
        119,
        134,
        156,
        192,
        71,
        218,
        217,
        6
      ]
    },
    {
      "name": "txQueued",
      "discriminator": [
        133,
        152,
        149,
        230,
        189,
        143,
        137,
        157
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
      "name": "notGuardian",
      "msg": "Caller is not guardian"
    },
    {
      "code": 6002,
      "name": "zeroAddress",
      "msg": "Zero address"
    },
    {
      "code": 6003,
      "name": "txNotQueued",
      "msg": "Tx not queued"
    },
    {
      "code": 6004,
      "name": "txAlreadyQueued",
      "msg": "Tx already queued"
    },
    {
      "code": 6005,
      "name": "txNotReady",
      "msg": "Tx not ready (still in delay period)"
    },
    {
      "code": 6006,
      "name": "txExpired",
      "msg": "Tx expired (past grace period)"
    },
    {
      "code": 6007,
      "name": "delayTooShort",
      "msg": "Delay too short (min 24h)"
    },
    {
      "code": 6008,
      "name": "delayTooLong",
      "msg": "Delay too long (max 30 days)"
    },
    {
      "code": 6009,
      "name": "invalidPauseTarget",
      "msg": "Invalid pause target (not registered)"
    },
    {
      "code": 6010,
      "name": "setupAlreadyComplete",
      "msg": "Setup already complete (batch_set_pausable_targets disabled)"
    },
    {
      "code": 6011,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6012,
      "name": "notPendingOwner",
      "msg": "Caller is not the pending owner"
    },
    {
      "code": 6013,
      "name": "invalidTxHash",
      "msg": "tx_hash does not bind the queued payload (target, instruction_hash, accounts_hash)"
    },
    {
      "code": 6014,
      "name": "invalidTarget",
      "msg": "Dispatched target program does not match the queued target"
    },
    {
      "code": 6015,
      "name": "instructionHashMismatch",
      "msg": "Dispatched instruction data does not match the queued instruction_hash"
    },
    {
      "code": 6016,
      "name": "accountsHashMismatch",
      "msg": "Dispatched accounts do not match the queued accounts_hash"
    }
  ],
  "types": [
    {
      "name": "delayUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldDelay",
            "type": "i64"
          },
          {
            "name": "newDelay",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "emergencyPause",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "guardian",
            "type": "pubkey"
          },
          {
            "name": "target",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "guardianUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "oldGuardian",
            "type": "pubkey"
          },
          {
            "name": "newGuardian",
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
      "name": "pausableTarget",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "target",
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
      "name": "pausableTargetUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "target",
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
      "name": "queuedTx",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "txHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "target",
            "type": "pubkey"
          },
          {
            "name": "instructionHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "accountsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "eta",
            "type": "i64"
          },
          {
            "name": "queuedBy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "setupCompleted",
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "timelockConfig",
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
            "name": "guardian",
            "type": "pubkey"
          },
          {
            "name": "delay",
            "type": "i64"
          },
          {
            "name": "setupComplete",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "txCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "txHash",
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
      "name": "txExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "txHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "target",
            "type": "pubkey"
          },
          {
            "name": "executedBy",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "txQueued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "txHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "target",
            "type": "pubkey"
          },
          {
            "name": "eta",
            "type": "i64"
          },
          {
            "name": "queuedBy",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
