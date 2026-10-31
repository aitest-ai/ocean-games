export const CONTENT = {
  "schemaVersion": 1,
  "locale": "zh-Hant-TW",
  "title": "雨天樂樂棒：18 位單人輪替教學題庫",
  "ruleProfile": {
    "id": "chba-general-learning-v1",
    "displayName": "協會一般組教學設定（比賽前請核對校內規程）",
    "teacherMustConfirm": true,
    "teeBall": true,
    "leadingOff": false,
    "stealing": false,
    "tagOuts": false,
    "sliding": false,
    "allBasesOverrunnable": true,
    "caughtFlyDeadBall": true,
    "fiveMetreInvalidZone": true,
    "fiveMetreCommitLine": true,
    "inningModel": "notSimulated",
    "excluded": [
      "再上場資格",
      "最後一棒得分",
      "平手辦法",
      "複雜雙色壘例外",
      "內野必死飛球棒球規則"
    ]
  },
  "safety": {
    "equipment": "empty-hands-only",
    "space": "教師確認單人活動區與同學等候區分離",
    "movement": "原地輕踏或坐姿手勢；不要求衝刺、跳躍、真揮棒或實際投球",
    "fallback": "每題均能以按鈕、鍵盤或單手停留選擇",
    "trackingLoss": "自動暫停且不扣分",
    "noPhysicalSpeedScoring": true,
    "camera": "開啟前說明與同意；不錄影、不上傳影像"
  },
  "rounds": [
    {
      "id": "beginner",
      "label": "打擊與出發",
      "durationSeconds": 180,
      "questionCount": 6,
      "levels": [
        1
      ]
    },
    {
      "id": "intermediate",
      "label": "停壘與安全傳球",
      "durationSeconds": 210,
      "questionCount": 8,
      "levels": [
        1,
        2
      ]
    },
    {
      "id": "advanced",
      "label": "先看情境再決定",
      "durationSeconds": 240,
      "questionCount": 8,
      "levels": [
        2,
        3
      ]
    }
  ],
  "sources": [
    {
      "id": "chba-general",
      "title": "中華民國樂樂棒球協會：一般組規則",
      "url": "https://chba.org.tw/cmrule/",
      "verifiedAt": "2026-10-31",
      "scope": "公開一般組規則；非特定學年度賽事公告"
    },
    {
      "id": "chba-faq",
      "title": "中華民國樂樂棒球協會：常見規則問題說明",
      "url": "https://chba.org.tw/judgeanaly/",
      "verifiedAt": "2026-10-31",
      "scope": "官方判例；須與實際賽事規程核對"
    }
  ],
  "scenarios": [
    {
      "id": "bat-01",
      "mode": "batting",
      "level": 1,
      "prompt": "準備打擊時，有同學走進你的活動區。你先做什麼？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "onTee"
      },
      "options": [
        {
          "id": "stop",
          "label": "停下並提醒老師"
        },
        {
          "id": "swing",
          "label": "繼續揮動"
        },
        {
          "id": "chase",
          "label": "追著同學移動"
        }
      ],
      "correct": "stop",
      "explanation": "先停下，等活動區清空再開始。這是室內遊戲安全規範，不是出局判定。",
      "sourceIds": [],
      "answerBasis": "classroom-safety",
      "difficulty": 1,
      "concept": "bat-01",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "classroom-safety-policy"
      ]
    },
    {
      "id": "bat-02",
      "mode": "batting",
      "level": 1,
      "prompt": "球固定在打擊座上。畫面亮綠燈、活動區安全，現在做什麼？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "onTee"
      },
      "options": [
        {
          "id": "swing",
          "label": "原地小幅度空手打擊"
        },
        {
          "id": "waitPitch",
          "label": "等投手投球"
        },
        {
          "id": "jump",
          "label": "跳起來打"
        }
      ],
      "correct": "swing",
      "explanation": "樂樂棒球使用打擊座。綠燈只是本遊戲準備提示，不是投球。雙腳留在活動區。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "cue": "ready-green",
      "gesture": "small-empty-hand-swing",
      "notARealPitch": true,
      "difficulty": 1,
      "concept": "bat-02",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "bat-03",
      "mode": "batting",
      "level": 1,
      "prompt": "實際比賽擊出有效球後，接著應做什麼？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "fairGroundBall"
      },
      "options": [
        {
          "id": "first",
          "label": "安全放下球棒，往一壘"
        },
        {
          "id": "carry",
          "label": "拿著球棒往一壘"
        },
        {
          "id": "second",
          "label": "跳過一壘直接到二壘"
        }
      ],
      "correct": "first",
      "explanation": "先安全放棒，再依序跑壘。本遊戲請空手原地踏步，不真的衝出去。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "difficulty": 1,
      "concept": "bat-03",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general"
      ]
    },
    {
      "id": "bat-04",
      "mode": "batting",
      "level": 2,
      "prompt": "球停在場內距本壘3公尺處，裁判已宣告無效界外球。你現在應該？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "calledFoul",
        "stoppedDistanceMetres": 3,
        "strikesBefore": 0
      },
      "options": [
        {
          "id": "reset",
          "label": "留在打擊區重新準備"
        },
        {
          "id": "run",
          "label": "立刻跑一壘"
        },
        {
          "id": "score",
          "label": "直接跑回本壘得分"
        }
      ],
      "correct": "reset",
      "explanation": "依本規則設定，未超過5公尺有效區且裁判宣告界外，不能當成有效安打跑壘。這次計一好球。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "requiresProfile": [
        "fiveMetreInvalidZone"
      ],
      "difficulty": 2,
      "concept": "bat-04",
      "interactionSupport": "choice-only",
      "coreOnly": false,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "run-01",
      "mode": "running",
      "level": 1,
      "prompt": "你在一壘，球仍在打擊座上，打者尚未擊中球。你應該？",
      "runners": [
        {
          "base": 1,
          "status": "onBase"
        }
      ],
      "outs": 0,
      "ball": {
        "state": "onTee"
      },
      "options": [
        {
          "id": "hold",
          "label": "留在壘上等待"
        },
        {
          "id": "lead",
          "label": "先離壘幾步"
        },
        {
          "id": "steal",
          "label": "搶跑二壘"
        }
      ],
      "correct": "hold",
      "explanation": "擊出球後才可離壘。本設定沒有離壘預備或盜壘。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "difficulty": 1,
      "concept": "run-01",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general"
      ]
    },
    {
      "id": "run-02",
      "mode": "running",
      "level": 1,
      "prompt": "你是打者，球已有效落地，壘上沒有跑者。第一個要碰的壘是？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "fairGroundBall"
      },
      "options": [
        {
          "id": "first",
          "label": "一壘"
        },
        {
          "id": "second",
          "label": "二壘"
        },
        {
          "id": "third",
          "label": "三壘"
        }
      ],
      "correct": "first",
      "explanation": "按一壘、二壘、三壘、本壘的順序前進，不能跳過壘包。畫面只需原地踏步。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "difficulty": 1,
      "concept": "run-02",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general"
      ]
    },
    {
      "id": "run-03",
      "mode": "running",
      "level": 1,
      "prompt": "你已安全到二壘，教練舉起停止手勢，三壘守備員正持球等你。練習目標是安全停壘，你應該？",
      "runners": [
        {
          "base": 2,
          "status": "safeOnBase",
          "isLearner": true
        }
      ],
      "outs": 1,
      "ball": {
        "state": "held",
        "holderBase": 3
      },
      "options": [
        {
          "id": "hold",
          "label": "留在二壘"
        },
        {
          "id": "third",
          "label": "繼續衝三壘"
        },
        {
          "id": "home",
          "label": "跳過三壘回本壘"
        }
      ],
      "correct": "hold",
      "explanation": "這題依教練手勢及球的位置練習停壘，並不是規定每次安打只能跑二壘。",
      "sourceIds": [
        "chba-faq"
      ],
      "answerBasis": "coaching-scenario",
      "coachSignal": "stop",
      "objective": "safeHold",
      "receiverReady": [
        3
      ],
      "difficulty": 1,
      "concept": "run-03",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-faq"
      ]
    },
    {
      "id": "run-04",
      "mode": "running",
      "level": 2,
      "prompt": "你原本在一壘，已跑向二壘；高飛球確定被接住，裁判宣告死球。你應該？",
      "runners": [
        {
          "base": 1,
          "status": "advancing",
          "destination": 2,
          "isLearner": true
        }
      ],
      "outs": 0,
      "ball": {
        "state": "caughtFlyDead"
      },
      "options": [
        {
          "id": "return",
          "label": "回原來的一壘"
        },
        {
          "id": "tagUp",
          "label": "回一壘後再衝二壘"
        },
        {
          "id": "keep",
          "label": "繼續跑二壘"
        }
      ],
      "correct": "return",
      "explanation": "本樂樂棒規則接殺後立即死球，所有跑者回原壘；不使用棒球的接殺後再進壘規則。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "requiresProfile": [
        "caughtFlyDeadBall"
      ],
      "difficulty": 2,
      "concept": "run-04",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "run-05",
      "mode": "running",
      "level": 2,
      "prompt": "你已安全到一壘。內野手停止傳殺、把球傳回捕手，裁判已宣告本次攻防結束。你應該？",
      "runners": [
        {
          "base": 1,
          "status": "safeOnBase",
          "isLearner": true
        }
      ],
      "outs": 1,
      "ball": {
        "state": "resetDead",
        "returnedTo": "catcher"
      },
      "options": [
        {
          "id": "hold",
          "label": "留在一壘等下一棒"
        },
        {
          "id": "second",
          "label": "趁傳球偷跑二壘"
        },
        {
          "id": "home",
          "label": "自行回本壘"
        }
      ],
      "correct": "hold",
      "explanation": "攻防已停止，就保留已取得的壘位。下一棒擊出後再前進，不趁回傳偷跑。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "difficulty": 2,
      "concept": "run-05",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "run-06",
      "mode": "running",
      "level": 3,
      "prompt": "球仍在比賽中。你由二壘跑向三壘，已越過5公尺不可折返線，三壘沒有其他跑者。你應該？",
      "runners": [
        {
          "base": 2,
          "status": "committed",
          "destination": 3,
          "pastCommitLine": true,
          "isLearner": true
        }
      ],
      "outs": 1,
      "ball": {
        "state": "liveHeld"
      },
      "options": [
        {
          "id": "third",
          "label": "繼續前進三壘"
        },
        {
          "id": "back",
          "label": "立刻退回二壘"
        },
        {
          "id": "stopMid",
          "label": "留在兩壘之間"
        }
      ],
      "correct": "third",
      "explanation": "本設定已越過不可折返線，且下一壘沒有跑者，須繼續前進。這不是叫你在教室衝刺，仍用原地動作操作。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "requiresProfile": [
        "fiveMetreCommitLine"
      ],
      "difficulty": 3,
      "concept": "run-06",
      "interactionSupport": "choice-only",
      "coreOnly": false,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "def-01",
      "mode": "fielding",
      "level": 1,
      "prompt": "壘上無人，打者正往一壘。你接到滾地球，一壘隊友準備好，傳球會先到。傳哪裡取得這個出局？",
      "runners": [
        {
          "base": 0,
          "status": "advancing",
          "destination": 1
        }
      ],
      "outs": 0,
      "ball": {
        "state": "fielderControlled"
      },
      "options": [
        {
          "id": "first",
          "label": "一壘"
        },
        {
          "id": "second",
          "label": "二壘"
        },
        {
          "id": "third",
          "label": "三壘"
        }
      ],
      "correct": "first",
      "explanation": "打者的下一個壘是一壘。傳給準備好的隊友，持球踩防守壘，不用拿球碰跑者。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "receiverReady": [
        1
      ],
      "ballCanBeatRunnerAt": [
        1
      ],
      "difficulty": 1,
      "concept": "def-01",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general"
      ]
    },
    {
      "id": "def-02",
      "mode": "fielding",
      "level": 2,
      "prompt": "原本一壘有人，打者擊出有效滾地球。一壘跑者必須往二壘；二壘隊友已就位，傳球會先到，其他接球員未就位。你傳哪裡？",
      "runners": [
        {
          "base": 1,
          "status": "forced",
          "destination": 2
        },
        {
          "base": 0,
          "status": "advancing",
          "destination": 1
        }
      ],
      "outs": 0,
      "ball": {
        "state": "fielderControlled"
      },
      "options": [
        {
          "id": "second",
          "label": "二壘"
        },
        {
          "id": "third",
          "label": "三壘"
        },
        {
          "id": "tag",
          "label": "追著跑者觸殺"
        }
      ],
      "correct": "second",
      "explanation": "看跑者要去的壘與接球隊友位置。這題二壘已有可靠接球點；本規則不用觸殺。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "coaching-scenario",
      "receiverReady": [
        2
      ],
      "ballCanBeatRunnerAt": [
        2
      ],
      "objective": "oneReliableOut",
      "difficulty": 2,
      "concept": "def-02",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "def-03",
      "mode": "fielding",
      "level": 3,
      "prompt": "滿壘，球已有效落地。三壘跑者往本壘，本壘隊友就位，傳球會先到。這回合任務是阻止這名跑者得分，你傳哪裡？",
      "runners": [
        {
          "base": 1,
          "status": "forced",
          "destination": 2
        },
        {
          "base": 2,
          "status": "forced",
          "destination": 3
        },
        {
          "base": 3,
          "status": "forced",
          "destination": 4
        }
      ],
      "outs": 1,
      "ball": {
        "state": "fielderControlled"
      },
      "options": [
        {
          "id": "home",
          "label": "本壘"
        },
        {
          "id": "first",
          "label": "一壘"
        },
        {
          "id": "second",
          "label": "二壘"
        }
      ],
      "correct": "home",
      "explanation": "這題已指定阻止眼前這一分，而且本壘傳球來得及，所以選本壘。不是所有滿壘情況都只能傳本壘。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "coaching-scenario",
      "receiverReady": [
        4
      ],
      "ballCanBeatRunnerAt": [
        4
      ],
      "objective": "preventLeadRunnerScoring",
      "difficulty": 3,
      "concept": "def-03",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general"
      ]
    },
    {
      "id": "def-04",
      "mode": "fielding",
      "level": 2,
      "prompt": "你把高飛球穩穩接住，裁判已宣告死球。跑者正在回原壘，接著應該？",
      "runners": [
        {
          "base": 1,
          "status": "returning",
          "destination": 1
        }
      ],
      "outs": 0,
      "ball": {
        "state": "caughtFlyDead"
      },
      "options": [
        {
          "id": "reset",
          "label": "停止傳殺，等下一棒"
        },
        {
          "id": "second",
          "label": "再傳二壘抓出局"
        },
        {
          "id": "tag",
          "label": "拿球追著跑者碰"
        }
      ],
      "correct": "reset",
      "explanation": "接殺後本次比賽停止，不能再傳殺回壘跑者。本題不是棒球雙殺練習。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "requiresProfile": [
        "caughtFlyDeadBall"
      ],
      "difficulty": 2,
      "concept": "def-04",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "def-05",
      "mode": "fielding",
      "level": 3,
      "prompt": "二壘跑者已越過不可折返線往三壘，三壘原本無人。你持球，三壘隊友已就位且傳球來得及。應傳哪裡？",
      "runners": [
        {
          "base": 2,
          "status": "committed",
          "destination": 3,
          "pastCommitLine": true
        }
      ],
      "outs": 1,
      "ball": {
        "state": "fielderControlled"
      },
      "options": [
        {
          "id": "third",
          "label": "三壘"
        },
        {
          "id": "second",
          "label": "二壘"
        },
        {
          "id": "tag",
          "label": "追著跑者觸殺"
        }
      ],
      "correct": "third",
      "explanation": "這個跑者已承諾前進三壘，本情境以三壘作為封殺目標；不用夾殺或觸殺。",
      "sourceIds": [
        "chba-faq"
      ],
      "answerBasis": "rule",
      "requiresProfile": [
        "fiveMetreCommitLine"
      ],
      "receiverReady": [
        3
      ],
      "ballCanBeatRunnerAt": [
        3
      ],
      "difficulty": 3,
      "concept": "def-05",
      "interactionSupport": "choice-only",
      "coreOnly": false,
      "sourceRefs": [
        "chba-faq"
      ]
    },
    {
      "id": "def-06",
      "mode": "fielding",
      "level": 3,
      "prompt": "原本只有二壘有人，那名跑者仍踩在二壘；一壘原本空著。打者正跑一壘，你接到滾地球，一壘隊友已就位且傳球來得及。應傳哪裡？",
      "runners": [
        {
          "base": 2,
          "status": "onBase"
        },
        {
          "base": 0,
          "status": "advancing",
          "destination": 1
        }
      ],
      "outs": 1,
      "ball": {
        "state": "fielderControlled"
      },
      "options": [
        {
          "id": "first",
          "label": "一壘"
        },
        {
          "id": "third",
          "label": "三壘"
        },
        {
          "id": "tag",
          "label": "觸碰站在二壘的跑者"
        }
      ],
      "correct": "first",
      "explanation": "二壘跑者這次沒有被強迫前進，也沒有離壘。一壘能處理正在跑的打者；不能只看到有人就亂傳下一壘。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "receiverReady": [
        1
      ],
      "ballCanBeatRunnerAt": [
        1
      ],
      "difficulty": 3,
      "concept": "def-06",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "run-07",
      "mode": "running",
      "level": 2,
      "prompt": "你安全踩到二壘後因慣性衝過，沒有往三壘前進。依本版樂樂棒規則，接著應該？",
      "runners": [
        {
          "base": 2,
          "status": "safeOnBase",
          "isLearner": true
        }
      ],
      "outs": 1,
      "ball": {
        "state": "liveHeld"
      },
      "options": [
        {
          "id": "return",
          "label": "回二壘站好"
        },
        {
          "id": "tag",
          "label": "只要離開二壘就一定可被觸殺"
        },
        {
          "id": "skip",
          "label": "不用再回壘，直接跳過三壘"
        }
      ],
      "correct": "return",
      "explanation": "本規則各壘都可衝過後回壘，不只一壘。仍要先踩到壘，且不能把衝過壘當成任意前進或漏踩壘。",
      "sourceIds": [
        "chba-general",
        "chba-faq"
      ],
      "answerBasis": "rule",
      "difficulty": 2,
      "concept": "run-07",
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "sourceRefs": [
        "chba-general",
        "chba-faq"
      ]
    },
    {
      "id": "bat-05",
      "mode": "batting",
      "level": 2,
      "difficulty": 2,
      "concept": "third-strike-foul",
      "prompt": "已經兩好球，這次裁判判定界外球。一般組規則下如何處理？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "out",
          "label": "三好球出局"
        },
        {
          "id": "again",
          "label": "永遠可以重打"
        },
        {
          "id": "walk",
          "label": "直接保送"
        }
      ],
      "correct": "out",
      "explanation": "界外球也計好球；兩好球後再界外會出局。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-general:三、1"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "bat-06",
      "mode": "batting",
      "level": 1,
      "difficulty": 1,
      "concept": "no-bunt",
      "prompt": "準備打擊時，想把球輕觸落在打擊座旁，使用觸擊戰術。這個一般組設定允許嗎？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "no",
          "label": "不允許觸擊"
        },
        {
          "id": "yes",
          "label": "隨時都可以"
        },
        {
          "id": "steal",
          "label": "只要先有人盜壘就可以"
        }
      ],
      "correct": "no",
      "explanation": "一般組不採觸擊；違規計好球，不是自動安打。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-general:一、3"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "bat-07",
      "mode": "batting",
      "level": 1,
      "difficulty": 1,
      "concept": "comfortable-motion",
      "prompt": "這是室內空手體驗。想提高表現時，哪個做法符合遊戲安全目標？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "control",
          "label": "保持平衡，以舒服的小幅度動作操作"
        },
        {
          "id": "hard",
          "label": "越用力越好"
        },
        {
          "id": "bat",
          "label": "改拿真的球棒揮"
        }
      ],
      "correct": "control",
      "explanation": "練習判斷與動作時機，不比真實打擊力量，也不用器材。",
      "sourceIds": [],
      "answerBasis": "classroom-safety",
      "sourceRefs": [
        "classroom-safety-policy"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "bat-08",
      "mode": "batting",
      "level": 1,
      "difficulty": 1,
      "concept": "tracking-pause",
      "prompt": "畫面顯示偵測不到你，遊戲已暫停。你應該？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "reset",
          "label": "留在活動區，請老師協助或改用按鈕"
        },
        {
          "id": "chase",
          "label": "衝向鏡頭"
        },
        {
          "id": "rush",
          "label": "暫停時趕快連續揮動"
        }
      ],
      "correct": "reset",
      "explanation": "先恢復安全操作；偵測問題不算學生答錯。",
      "sourceIds": [],
      "answerBasis": "classroom-safety",
      "sourceRefs": [
        "classroom-safety-policy"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "bat-09",
      "mode": "batting",
      "level": 1,
      "difficulty": 1,
      "concept": "equivalent-access",
      "prompt": "今天不方便站著做動作，仍想練習跑壘判斷。可以怎麼參與？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "seated",
          "label": "坐姿使用按鈕或單手選擇"
        },
        {
          "id": "skip",
          "label": "一定要退出活動"
        },
        {
          "id": "sprint",
          "label": "只要原地全力跑就好"
        }
      ],
      "correct": "seated",
      "explanation": "採相同情境與答案，不以站姿或動作幅度判斷學習能力。",
      "sourceIds": [],
      "answerBasis": "classroom-safety",
      "sourceRefs": [
        "classroom-safety-policy"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "run-08",
      "mode": "running",
      "level": 1,
      "difficulty": 1,
      "concept": "no-slide",
      "prompt": "你正接近壘包。下列哪個是真實樂樂棒的一般組規則？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "noSlide",
          "label": "不可滑壘"
        },
        {
          "id": "slide",
          "label": "滑壘是必要動作"
        },
        {
          "id": "tag",
          "label": "必須先被觸碰才能上壘"
        }
      ],
      "correct": "noSlide",
      "explanation": "滑壘不允許。教室中也不模仿滑壘，只做原地操作。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-general:一、8"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "run-09",
      "mode": "running",
      "level": 3,
      "difficulty": 3,
      "concept": "occupied-commit-exception",
      "prompt": "球仍在比賽中，你從二壘已踩到不可折返線，但三壘仍有前位跑者。規則是否允許退回二壘？",
      "runners": [
        {
          "base": 2,
          "status": "committed",
          "destination": 3,
          "pastCommitLine": true,
          "isLearner": true
        },
        {
          "base": 3,
          "status": "onBase"
        }
      ],
      "outs": 0,
      "ball": {
        "state": "liveHeld"
      },
      "options": [
        {
          "id": "mayReturn",
          "label": "可以，下一壘已有跑者是例外"
        },
        {
          "id": "never",
          "label": "絕對不可以退回"
        },
        {
          "id": "push",
          "label": "必須把前位跑者推出壘包"
        }
      ],
      "correct": "mayReturn",
      "explanation": "下一壘已有跑者時可退回，不可把不可折返線教成沒有例外。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-general:一、10"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": false,
      "requiresProfile": [
        "fiveMetreCommitLine"
      ]
    },
    {
      "id": "run-10",
      "mode": "running",
      "level": 2,
      "difficulty": 2,
      "concept": "advance-limit-agreement",
      "prompt": "球場外野很短且有障礙物。老師想用「球進障礙區判二壘安打」的場地約定，應何時說清楚？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "before",
          "label": "比賽前先約定並說明"
        },
        {
          "id": "after",
          "label": "等看到哪隊得利再決定"
        },
        {
          "id": "secret",
          "label": "只有守備隊知道就好"
        }
      ],
      "correct": "before",
      "explanation": "這是場地約定，不是所有有效安打固定只能跑兩壘。",
      "sourceIds": [
        "chba-faq"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-faq:3"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": false
    },
    {
      "id": "run-11",
      "mode": "running",
      "level": 1,
      "difficulty": 1,
      "concept": "next-player-space",
      "prompt": "你的回合已結束，下一位同學準備上場。你要怎麼做？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "clear",
          "label": "先離開活動區，等老師確認再換人"
        },
        {
          "id": "together",
          "label": "留著和下一位一起做"
        },
        {
          "id": "cross",
          "label": "從正在操作的人面前穿過"
        }
      ],
      "correct": "clear",
      "explanation": "一次一位玩家，等候區和動作區分開，避免碰撞及偵測混淆。",
      "sourceIds": [],
      "answerBasis": "classroom-safety",
      "sourceRefs": [
        "classroom-safety-policy"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "def-07",
      "mode": "fielding",
      "level": 2,
      "difficulty": 2,
      "concept": "tag-not-out",
      "prompt": "守備員持球碰到跑者，沒有完成其他合法出局，也沒有死球宣告。只憑這個碰觸算出局嗎？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "liveHeld"
      },
      "options": [
        {
          "id": "no",
          "label": "不算，比賽仍進行"
        },
        {
          "id": "yes",
          "label": "一定出局"
        },
        {
          "id": "two",
          "label": "算兩個出局"
        }
      ],
      "correct": "no",
      "explanation": "本設定不採觸殺；不能把碰到跑者當作出局。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-general:二、4"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "def-08",
      "mode": "fielding",
      "level": 2,
      "difficulty": 2,
      "concept": "uncaught-fly-not-auto-out",
      "prompt": "一、二壘有人，內野飛球沒有被接住，裁判確認仍是有效球。打者會因為「內野必死飛球」自動出局嗎？",
      "runners": [
        {
          "base": 1,
          "status": "onBase"
        },
        {
          "base": 2,
          "status": "onBase"
        }
      ],
      "outs": 0,
      "ball": {
        "state": "fairGroundBall"
      },
      "options": [
        {
          "id": "no",
          "label": "不會，還要完成合法守備"
        },
        {
          "id": "auto",
          "label": "會，落地前就一定出局"
        },
        {
          "id": "dead",
          "label": "所有漏接飛球都立即死球"
        }
      ],
      "correct": "no",
      "explanation": "此設定沒有內野必死飛球；漏接後不能直接套用棒球規則。",
      "sourceIds": [
        "chba-faq"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-faq:5"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": false
    },
    {
      "id": "def-09",
      "mode": "fielding",
      "level": 2,
      "difficulty": 2,
      "concept": "pre-swing-defense",
      "prompt": "打者還沒揮擊，防守同學想先站到投手板前方貼近打擊座。依一般組規則應該？",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "onTee"
      },
      "options": [
        {
          "id": "behind",
          "label": "保持在規定防守範圍，不先越過投手板"
        },
        {
          "id": "close",
          "label": "越靠近球座越好"
        },
        {
          "id": "touch",
          "label": "直接去碰打者"
        }
      ],
      "correct": "behind",
      "explanation": "揮擊前守備員不能越過投手板趨前防守；教室也要保持活動區淨空。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-general:二、2–3"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true
    },
    {
      "id": "def-10",
      "mode": "fielding",
      "level": 2,
      "difficulty": 2,
      "concept": "nine-batters-inning",
      "prompt": "一般組規則小問答：每局的打擊輪次採哪種方式？本題不要求操作換局。",
      "runners": [],
      "outs": 0,
      "ball": {
        "state": "teachingCard"
      },
      "options": [
        {
          "id": "nine",
          "label": "第 1 到第 9 棒打完一輪"
        },
        {
          "id": "three",
          "label": "一定在第 3 個出局時換邊"
        },
        {
          "id": "one",
          "label": "每隊只打一棒"
        }
      ],
      "correct": "nine",
      "explanation": "本規則每局打完九棒，不直接套用棒球的三出局換邊。本遊戲不模擬完整局數。",
      "sourceIds": [
        "chba-general"
      ],
      "answerBasis": "rule",
      "sourceRefs": [
        "chba-general:一、1"
      ],
      "interactionSupport": "choice-only",
      "coreOnly": true,
      "knowledgeOnly": true
    }
  ],
  "classRotationNotes": {
    "authoredTemplateCount": 30,
    "knowledgeInteraction": "choice-only",
    "actionLoops": "既有打擊與二壘傳球；此內容不新增物理模擬",
    "fairness": "所有學生使用同一動作難度；知識難度交錯並提供相同提示，勿以異題分數排名",
    "ruleProfileMustBeConfirmed": true
  }
};
export const SCENARIOS = CONTENT.scenarios.map(s => ({...s, options:s.options.map(o=>({...o,text:o.label}))}));
