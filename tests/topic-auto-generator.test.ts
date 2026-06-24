import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTopicGenerationUserPrompt,
  findSimilarRecentTopic,
  normalizeTopicForComparison,
  topicSimilarity,
  TOPIC_GENERATION_SYSTEM_PROMPT,
} from "../src/services/topicAutoGenerator";

test("topic generation prompt includes slot and recent topics to avoid duplicates", () => {
  const prompt = buildTopicGenerationUserPrompt({
    runDate: "2026-06-18",
    scheduledSlot: "evening_21",
    pillarName: "ml_algorithms",
    pillarDescription: "Cac thuat toan ML cot loi.",
    duplicateLookbackDays: 60,
    recentTopics: ["Gradient descent trong AI", "Dao ham giup may hoc nhu the nao"],
  });

  assert.match(TOPIC_GENERATION_SYSTEM_PROMPT, /STRICT JSON object/);
  assert.match(prompt, /Slot dang bai: evening_21/);
  assert.match(prompt, /Can tranh trung trong 60 ngay gan nhat/);
  assert.match(prompt, /Gradient descent trong AI/);
  assert.match(prompt, /Khong lap lai Gradient descent/);
});

test("topic similarity catches normalized and strongly overlapping topics", () => {
  assert.equal(normalizeTopicForComparison("Đạo hàm trong AI!"), "dao ham trong ai");
  assert.equal(topicSimilarity("Gradient Descent trong AI", "Gradient descent trong AI"), 1);
  assert.equal(
    findSimilarRecentTopic("Cách Gradient Descent giúp AI học", [
      "Gradient Descent giúp mô hình AI tự sửa sai",
      "Attention Mechanism trong Transformer",
    ]),
    "Gradient Descent giúp mô hình AI tự sửa sai"
  );
  assert.equal(findSimilarRecentTopic("Cây quyết định cho người mới", ["Vector embedding trong tìm kiếm"]), null);
});
