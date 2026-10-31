export const CONTENT = {
  "schemaVersion": 1,
  "locale": "zh-Hant-TW",
  "title": "雨天樂樂棒體感練習：第一版題庫",
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
      "answerBasis": "classroom-safety"
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
      "notARealPitch": true
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
      "answerBasis": "rule"
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
      "answerBasis": "rule"
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
      "answerBasis": "rule"
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
      "answerBasis": "rule"
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
      "objective": "oneReliableOut"
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
      "objective": "preventLeadRunnerScoring"
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
      ]
    }
  ]
};
CONTENT.scenarios.push({id:'run-07',mode:'running',level:2,prompt:'你安全踩到二壘後因慣性衝過，沒有往三壘前進。依本版樂樂棒規則，接著應該？',runners:[{base:2,status:'safeOnBase',isLearner:true}],outs:1,ball:{state:'liveHeld'},options:[{id:'return',label:'回二壘站好'},{id:'tag',label:'只要離開二壘就一定可被觸殺'},{id:'skip',label:'不用再回壘，直接跳過三壘'}],correct:'return',explanation:'本規則各壘都可衝過後回壘，不只一壘。仍要先踩到壘，且不能把衝過壘當成任意前進或漏踩壘。',sourceIds:['chba-general','chba-faq'],answerBasis:'rule'});
export const SCENARIOS = CONTENT.scenarios.map(s => ({...s, options:s.options.map(o=>({...o,text:o.label}))}));
