# 按学习序号组织课程的内容接口

内容以 `src/curriculum/types.ts` 为唯一类型约定，批次在 `src/curriculum/index.ts` 注册。每周使用正整数 `week`，不提供开始日期、截止日期、月份或考试倒计时。请明确总周数及连续的全部周纲；当前已交付第 1—84 周详细内容，更新时仍按各课实际完整性判定状态。

```ts
interface StudyWeek {
  week: number; title: string; stage: string; summary: string;
  subjects: Partial<Record<SubjectId, SubjectWeek>>;
}
type SubjectId = 'chinese' | 'math' | 'english' | 'physics' |
  'chemistry' | 'biology' | 'geography' | 'politics';
interface SubjectWeek {
  status: 'complete' | 'outline' | 'pending';
  title: string;
  goals: string[];
  prerequisites: string[];
  knowledge: { title: string; paragraphs: string[]; keyPoints?: string[] }[];
  examPoints: string[];
  examples: OriginalProblem[];
  exercises: OriginalProblem[];
  retest: { tasks: string[]; criteria: string[] };
  sourceIds: string[];
}
interface OriginalProblem {
  id: string; origin: 'original'; title: string; prompt: string;
  answer: string; solution: string[]; commonErrors?: string[];
}
interface PastPaperSource {
  id: string;
  kind: 'past-paper' | 'official-analysis' | 'reference';
  title: string; year: number; paper: string; publisher: string; url: string;
  question?: string; scopeNote: string;
}
```

第 1—4 周各科应按上述完整字段交付；后续仅有周纲时设置 `status: 'outline'`，题目与知识正文使用空数组，不填重复占位题。没有科目内容时省略该科或标为 `pending`。`complete` 只有目标、前置、正文、考点、例题及解析、练习及答案、复测都齐备时才显示为“完整讲解”。真题来源有独立状态，即使讲解完整，没有核验来源也明确显示“真题参考待补充”。

请给生物、地理、思想政治分别提供适用内容，切换第三科后不会复用生物任务。第一周若含三科比较，可在 summary 或各科 goals 中说明试学，而不将其认定为最终选科。

所有内置例题和独立练习标为原创；往年题通过 `sourceIds` 对应链接，必须记录年份、卷别、发布者及覆盖范围。`official-analysis` 仅显示为“官方试题评析”，不能标成完整真题；`reference` 不能标成完整试卷。题号仅在已核验时提供。不要复制商业题库或教材长段。正文用普通文本数组，界面不会执行 HTML。

稳定 ID 建议：例题 `w1-math-ex1`，练习 `w1-math-pr1`，来源 `math-2024-new1-official-analysis`。任务打卡按 `w1-math-knowledge/example/practice/retest` 保存，与日期无关。内容修订应保持已有 ID，避免丢失打卡对应关系。

数据 v2 将 `currentWeek` 作为手动学习序号，`weeks['1']` 等保存新学习周活动；原 v1 日历周保留在 `legacy.weeks`，首四周打卡保留为 `firstCompleted`。日志日期只记录实际学习发生日期，不决定课程周。v1 备份仍可导入并自动迁移，导出使用 v2。

## 已确认的内容批次接口

本次内容批次共 84 周。`src/curriculum/adapter.ts` 直接接收内容编写方的 `{ version, scheduleMode:'manual-week', dateBinding:false, thirdSubject:null, phases, weeks, lessons }` JSON：`weeks[].subjects` 支持八个中文学科键；周纲的 `topic/detailStatus/pastPapers` 和详情的 `objectives/prerequisites/knowledge[].explanation/examFocus/workedExample/practice/commonErrors/mastery/retest` 会转为上述内部类型。无需编写方重排数据。主课程数据保存在 `src/curriculum/study-plan-content-v1.json`，已在 index 注册。适配器只使用课程字段；可选时长建议沿用网站原先确认的配额，不读取内容文件的 plans 元数据。

来源数据独立保存于 `past-paper-sources.json`，只显示官方评析与短概述，没有原题全文和完整真题答案。


## 扩展字段与呈现

- `lesson.diagnosticTest` 保留 `title/totalPoints/scopeNote/instructions/questions/scoreInterpretation/remediationMap`。`questions[]` 在常规题目字段外保留稳定 `id`、`points` 和 `scoring: { points, criterion }[]`。适配器校验逐点评分与题分、总分一致；缺失题干、答案、解析或分值时不将测评伪装成完整。
- 普通题、复测题与诊断题共用 `OriginalProblem.vue`。`sourceStory/sourcePassage`、`paragraphStarters`、`sampleContinuation/sampleText` 保留；已嵌入题干或答案的同一段不重复显示。`sampleWordCount/passageWordCount/sampleCharacterCount/sampleCharacterCountWithPunctuation/wordCountNote/wordRange/characterRange/characterLimit` 按各题口径展示，不推定统一考试字数规则。
- `trainingMode/audioStatus/listeningMasteryStatus` 用独立文字预训练提示呈现，不生成音频控件，不因普通打卡而改变真实听辨状态。
- `materialNote/safetyScope` 独立展示。`sourceReferences` 及根级核验引用通过 `referenceIds`、`lessonId/lessonIds/lessons`、`appliesTo` 或 `usedIn` 关联到课次，保留原典与原理核验资料的性质，不混入往年真题索引。
- 覆盖统计从适配后实际完整性推导，支持后续非连续批次与部分学科补齐；课程发布数量不是学习者完成量。


第73—84周还支持 `progressionNote/trainingScope/masteryStatus/writingMasteryStatus/pendingChecklist`：分别显示训练边界、待独立作答状态与尚需验证的能力，不自动打卡或判定通过。`lesson.sources` 按根级核验记录ID解析；`question.sources` 仅将有效 HTTP(S) URL呈现为来源链接。`question.quotedSource` 保留作者、篇名、公版状态、引用原文和引用ID，明确原典不是课程原创；`characterCountNote` 显示各题汉字计数口径。
