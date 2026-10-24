// 姿態資料格式（taikan-kit 內部與預錄檔共用）
//
// 一個 pose = { t, kp } ；t 為毫秒，kp 為關節點物件：
//   kp.leftWrist = { x, y, v }
// 座標是「鏡像畫面」的正規化座標：x 0 = 畫面左、1 = 畫面右；y 0 = 上、1 = 下。
// 鏡像的意思是：玩家自己的左手出現在畫面左邊（跟照鏡子一樣），所以 left/right 都是玩家自己的左右。
// v 為可信度 0~1（看不到的點 v 很低）。

export const KEYPOINTS = [
  'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
];

// MediaPipe Pose Landmarker 33 點中，我們使用的點的索引
export const MEDIAPIPE_INDEX = {
  nose: 0, leftEye: 2, rightEye: 5, leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
};

// MediaPipe 的 landmarks（未鏡像的影像座標）→ pose
export function fromMediaPipe(landmarks, t) {
  const kp = {};
  for (const name of KEYPOINTS) {
    const l = landmarks[MEDIAPIPE_INDEX[name]];
    if (!l) continue;
    kp[name] = { x: 1 - l.x, y: l.y, v: l.visibility ?? 1 };
  }
  return { t, kp };
}

// 預錄檔的精簡格式：每格 [t, x0, y0, v0, x1, y1, v1, ...]，順序同 KEYPOINTS，數字取 3 位小數
export function packPose(p) {
  const row = [Math.round(p.t)];
  for (const name of KEYPOINTS) {
    const k = p.kp[name];
    if (k) row.push(+k.x.toFixed(3), +k.y.toFixed(3), +k.v.toFixed(2));
    else row.push(0, 0, 0);
  }
  return row;
}

export function unpackPose(row) {
  const kp = {};
  KEYPOINTS.forEach((name, i) => {
    const v = row[3 + i * 3];
    if (v > 0) kp[name] = { x: row[1 + i * 3], y: row[2 + i * 3], v };
  });
  return { t: row[0], kp };
}

export const visible = (k, min = 0.5) => !!k && k.v >= min;
