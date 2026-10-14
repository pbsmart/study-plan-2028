# 按周深化试点：稳定接口 v1

各周深化包是独立覆盖层，目前接入第1—2周语文、数学、英语、物理、化学。第3—84周及生物、地理、思想政治沿用旧内容，第三科保持未选。`pilot-ready` 是内容已形成试点版本，不能显示为学习者已掌握，也不能据此声称全部84周已经深化。

## 文件与标识

- 每个独立课程包提供 `lessons/{chinese,math,english,physics,chemistry}.json`，集成后置于配置指定的周目录。
- lesson.id 保留原周/学科标识，如 `w1-数学`、`w2-数学`；新活动ID使用对应周的稳定英文键，如 `w2-math-*`。
- 数字week及revision须与配置一致；当前为 `1 / week01-enriched-v1` 和 `2 / week02-enriched-v1`。无日期绑定、倒计时、自动推进。
- 本轮没有metadata包装层，顶层即一个lesson对象。外部源记录在sourcePolicy内，与往年真题索引分开。

## 必需顶层字段

id, week, subject, title, revision, status, objectives(string[]), prerequisites(string[]), budget, diagnostic, sections, workedExamples, practice, misconceptions, quiz, mastery(string[]), nextStep(string), sourcePolicy。

- budget: {coreMinutes:number, busyMinutes:number, extensionMinutes:number, busyPolicy:string, segments:[{id,title,minutes,activityIds:string[]}]}
- diagnostic: {instructions:string, questions:Question[], routes:[{when,action,sectionIds:string[]}]}
- sections: [{id,title,level:'core'|'remediation'|'extension',paragraphs:string[],keyPoints:string[],checkpoint:{question,answer,explanation}}]
- workedExamples、practice: Question[]
- misconceptions: [{wrong:string, why:string, right:string}]
- quiz: {instructions:string,totalPoints:number,questions:Question[],passRule:{minScore:number,requiredChecks:string[]},remediation:[{questionIds:string[],sectionIds:string[],action:string}]}
- sourcePolicy: {authorship:string,examStatus:string,externalSources:Source[]}
- Source（本轮预计为空）: {id,title,url,kind:'reference'|'public-domain-text',scopeNote:string}；只有核验后才可加入。

## Question

{id,title,origin:'original',level:'core'|'extension',difficulty:'foundation'|'application'|'transfer',prompt,answer,steps:string[],commonErrors:string[],estimatedMinutes:number,points?:number,scoring?:[{points:number,criterion:string}]}

prompt/answer/steps是普通文本；可以含换行、Unicode数学符号。不要执行HTML。每个短测问题必须有points/scoring，评分点之和=题分，题分之和=totalPoints。前测不计过关分，不能被UI默认加入总分。自动打勾不能代表评分或达标。

## 可选字段

- audioStatus:string：英语必有，明示未提供音频，不能证明真实听辨达标。
- safetyScope:string：化学必有，明确只做书面分类、不要求家庭实验。
- reviewActivity:{id,title,instructions:string[]}：预算订正槽的活动说明。
- diagrams: Diagram[]：物理图解，用结构化数据绘制或使用本包SVG；两者含义相同。

Diagram = {
  id,title,kind:'number-line',description,altText,
  axis:{unit:'m',positiveDirection:string,min:number,max:number,ticks:number[]},
  points:[{label:string,x:number}],
  route:[{from:number,to:number,label:string}],
  displacement:{from:number,to:number,label:string},
  linkedSectionIds:string[],
  asset?:string
}

图表示一维运动；from/to都是相对于原点的位置坐标。route按实际行走次序，不可以只把端点连成一条路程线。displacement从初位置直接指向末位置，长度是位移大小，箭头方向表示正负。asset为包内相对路径，例如assets/physics-route.svg。图须保留altText，非交互式SVG可随主题使用独立浅色底。

## 展示建议与兼容

每次只打开一科的当前学习段。顺序：开始与预算 → 前测及补救路由 → 分小节讲解/图 → 阶梯例题 → 独立练习 → 20分短测与订正。例题/练习/短测的答案和评分默认折叠；checkpoint的答案也折叠。题干永远可见，展开答案不自动完成活动。

预算内包含前测、阅读、例题模仿、独立练习、短测和订正，不再在总量之上加一次“复习”。各科正常预算为语文120、数学240、英语180、物理180、化学150，共870分钟=14.5小时；第三科留90分钟，仍未选定。忙碌方案只改变每个可用周期的投入，同一个学习周可以跨多个周期，不能把核心课程强制削半或自动跳周。拓展单独标示，不计核心达标。

旧84周数据保持原样。新render入口按“该周已配置且存在overlay”读取本格式；如果只能用旧renderer，显式转化sections→knowledge、workedExamples→examples时必须保留多段正文/所有步骤，并单独处理diagnostic与quiz，不能静默丢字段后仍显示“深化版”。


## 可配置周号与静态图（第2周接入）

`src/curriculum/enrichment-config.ts` 明确列出已接入周的week、revision和directory；插件逐项校验课id、学科、周号与版本，不从目录名猜测或自动为后续周开启深化。已有第1周JSON保持原样。

`figureManifests` 配置学科与包内sidecar JSON路径，可为单图对象或数组；每图包含id/title/asset/altText/linkedSectionIds/linkedQuestionIds。asset只允许包内assets/*.svg。`preferDiagramAssets`可使用物理Diagram提供的原SVG，并避免结构化图重复出现。`diagramQuestionLinks`提供明确的补充例题关联，当前只把第2周往返图关联到正文明确引用它的w2-physics-ex2，不关联只问去程的ex1。

编译后的`enrichmentFigures`保持与作者`enrichment`分离；包含Vite解析的src、等效文本、关联ID和viewBox尺寸。SVG以img加载，不执行内联HTML，不重画数学端点或化学微粒。图中有计算结果时，例题图进入答案details；教学小节直接展示。手机图片使用可键盘操作的内部滚动区域，下方保留完整等效文字。

Vite只监听具体JSON/SVG文件，不能再次把目录作为load依赖。构建检查初始JS、84周独立块及4张图的资源归属/体积，dev transform测试覆盖真实browser import-analysis。
