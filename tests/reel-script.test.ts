import assert from "node:assert/strict";
import test from "node:test";
import { countVietnameseWords, hasVietnameseDiacritics, parseReelScript, validateCaption } from "../src/services/reels/reelScript";

const valid = JSON.stringify({
  title: "Máy học bắt đầu từ đâu?",
  scenes: [
    {
      id: "hook",
      target_seconds: 4,
      narration: "Máy tính học bằng cách nào?",
      caption: "MÁY TÍNH HỌC\nTHẾ NÀO?",
    },
    {
      id: "insight",
      target_seconds: 7,
      narration: "Nó tìm quy luật trong dữ liệu để dự đoán và giảm sai số.",
      caption: "TÌM QUY LUẬT\nTỪ DỮ LIỆU",
    },
    {
      id: "cta",
      target_seconds: 4,
      narration: "Xem bài viết để hiểu rõ hơn.",
      caption: "XEM BÀI VIẾT ĐẦY ĐỦ",
    },
  ],
});

test("parseReelScript accepts the required three-scene shape", () => {
  const script = parseReelScript(valid);
  assert.equal(script.scenes.length, 3);
  assert.equal(script.scenes[1]?.targetSeconds, 7);
  assert.equal(countVietnameseWords(script.narration), 27);
});

test("parseReelScript rejects scene order and caption overflow", () => {
  const wrongOrder = valid.replace('"id":"hook"', '"id":"insight"');
  assert.throws(() => parseReelScript(wrongOrder), /Invalid Reel scene/);
  assert.throws(() => validateCaption("A".repeat(27)), /at most 26/);
});

test("parseReelScript rejects unaccented Vietnamese narration", () => {
  assert.equal(hasVietnameseDiacritics("Máy tính học từ dữ liệu."), true);
  assert.equal(hasVietnameseDiacritics("May tinh hoc tu du lieu."), false);

  const unaccented = JSON.stringify({
    title: "May hoc bat dau tu dau?",
    scenes: [
      {
        id: "hook",
        target_seconds: 4,
        narration: "May tinh hoc bang cach nao?",
        caption: "MAY TINH HOC\nTHE NAO?",
      },
      {
        id: "insight",
        target_seconds: 7,
        narration: "No tim quy luat trong du lieu de du doan va giam sai so.",
        caption: "TIM QUY LUAT\nTU DU LIEU",
      },
      {
        id: "cta",
        target_seconds: 4,
        narration: "Xem bai viet de hieu ro hon.",
        caption: "XEM BAI VIET DAY DU",
      },
    ],
  });

  assert.throws(() => parseReelScript(unaccented), /Vietnamese with accents/);
});
