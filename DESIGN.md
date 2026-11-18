---
version: "alpha"
name: "Weft"
description: "Weft 人际关系图谱 · 对话感（2026-11 改版）。简洁、耐用、易用、大大方方：白底，内容直接铺开，靠留白与字号分层；近黑中性主色只给主按钮、当前态与焦点，彩色只用于状态；参考豆包——输入框是对话页的视觉焦点，回答不套卡片。移动端优先（375px 基准），桌面端内容限宽 720 居中。"

colors:
  # 主色 = 近黑墨色：只给主按钮、当前 tab / 选中态、焦点环。不用于链接、标签、徽章。
  primary:
    6: "#18181B"
    5: "#27272A"
    7: "#09090B"
    1: "#F4F4F5"
  # 辅色并入中性：次级强调（例如“本人说”徽章、选中的次级态）一律用中性灰，不再引入第二个彩色。
  secondary:
    6: "#52525B"
    5: "#3F3F46"
    7: "#27272A"
    1: "#F4F4F5"
  neutral:
    bg-layout: "#FFFFFF"      # 页面底色：白
    bg-container: "#FFFFFF"   # 抽屉 / 弹窗 / 浮层
    bg-subtle: "#F7F7F8"      # 侧栏、已入图谱的草稿卡、综合描述等弱分区
    bg-muted: "#F0F0F2"       # 用户气泡、标签、分段控件底、悬停
    border: "#E4E4E7"         # 输入框、次按钮描边
    divider: "#ECECEF"        # 列表分隔线
    text-primary: "#18181B"   # 17.7:1
    text-secondary: "#52525B" # 7.7:1
    text-tertiary: "#71717A"  # 元信息、分区标题；白底 4.8:1，bg-subtle 4.5:1
    text-disabled: "#A1A1AA"  # 仅占位符与禁用控件
  # 彩色只用于状态。6 级用于文字（均已校验对 1 级浅底 ≥ 4.5:1），graphic 用于图标 / 对勾等图形（≥ 3:1）。
  status:
    success: { 1: "#F0FDF4", 6: "#15803D", 7: "#166534", graphic: "#16A34A" }
    warning: { 1: "#FFFBEB", 6: "#B45309", 7: "#92400E", graphic: "#D97706" }
    error: { 1: "#FEF2F2", 6: "#B91C1C", 7: "#991B1B", graphic: "#DC2626" }
    info: { 1: "#EFF6FF", 6: "#1D4ED8", 7: "#1E40AF", graphic: "#2563EB" }
  # 关系图谱按关系大类着色（线、节点外环、扇区名、群体光晕）。亮色复用主色 / 辅色 / 状态色，只有“情感”新增一色。
  graph:
    kin: "#0B7A6E"          # 亲属 = secondary.6
    romance: "#DB2777"      # 情感（新增）
    social: "#4F46E5"       # 社会 = primary.6
    interest: "#B45309"     # 利益 = status.warning.6
    hostile: "#C81E1E"      # 敌对 = status.error.6
    tense: "#C81E1E"        # 关系紧张的连线
    path: "#F59E0B"         # 问答路径点亮
    ring: "rgba(91, 100, 117, 0.12)"   # 亲密度同心环
    fade: "0.15"            # 聚焦 / 问答时非相关元素的不透明度
  # 星空主题：只作用于图谱区域。深底上的颜色取更亮的同色系，发光用同色 shadow。
  graph-dark:
    bg-inner: "#121A38"
    bg-outer: "#05070F"
    star: "rgba(200, 210, 255, 0.8)"
    ring: "rgba(140, 160, 230, 0.14)"
    text: "#C7D2FE"
    text-muted: "#9AA6C8"
    node-fill: "#0E1430"
    self-fill: "#312E81"
    self-stroke: "#A5B4FC"
    kin: "#2DD4BF"
    romance: "#F472B6"
    social: "#818CF8"
    interest: "#FBBF24"
    hostile: "#FB7185"
    tense: "#FB7185"
    path: "#FDE68A"
    panel: "rgba(14, 20, 40, 0.92)"
    panel-border: "#24304F"

typography:
  font-family: "'PingFang SC', 'HarmonyOS Sans SC', 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif"
  font-family-heading: "'PingFang SC', 'HarmonyOS Sans SC', 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif"
  font-family-mono: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace"
  h1: { size: "24px", weight: "600", line-height: "32px" }
  h2: { size: "20px", weight: "600", line-height: "28px" }
  h3: { size: "17px", weight: "600", line-height: "24px" }
  body-lg: { size: "16px", weight: "400", line-height: "24px" }
  body-md: { size: "15px", weight: "400", line-height: "24px" }
  body-sm: { size: "14px", weight: "400", line-height: "20px" }
  caption: { size: "12px", weight: "400", line-height: "18px" }
  section: { size: "13px", weight: "600", line-height: "20px", color: "colors.neutral.text-tertiary" }   # 分区标题
  meta: { size: "13px", weight: "400", line-height: "20px", color: "colors.neutral.text-tertiary" }       # 元信息

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  xxxl: "64px"

rounded:
  sm: "8px"     # 按钮内小元素、徽章内角、引用标记
  md: "12px"    # 卡片、草稿卡、列表悬停底
  lg: "20px"    # 抽屉顶部、弹窗
  xl: "24px"    # 对话输入框
  bubble: "18px 18px 6px 18px"  # 用户气泡
  full: "9999px" # 按钮、标签、头像、分段控件

shadow:
  sm: "0 1px 2px rgba(0, 0, 0, 0.04)"
  md: "0 4px 16px rgba(0, 0, 0, 0.06)"     # 输入框
  lg: "0 12px 32px rgba(0, 0, 0, 0.10)"    # 输入框聚焦、抽屉、弹窗

motion:
  easing-standard: "cubic-bezier(0.2, 0, 0, 1)"     # 屏内状态变化
  easing-decelerate: "cubic-bezier(0, 0, 0, 1)"     # 进入
  easing-accelerate: "cubic-bezier(0.3, 0, 1, 1)"   # 退出
  fast: "120ms"      # 按下、悬停、颜色变化
  base: "200ms"      # 页面切换进入、淡入、chip 轻弹
  exit: "150ms"      # 页面切换退出
  sheet: "250ms"     # 抽屉 / 侧栏进入（退出 200ms + accelerate）
  emphasis: "300ms"  # 草稿入图谱收起、对勾画出、数字滚动
  stagger: "30ms"    # 列表入场错开，最多 6 项
  press-scale: "0.98"
  reduced: "所有过渡改为直接切换；骨架屏改为静态"

breakpoints:
  mobile: "< 768px（单栏 + 底部 TabBar）"
  tablet: "768–1199px（SideNav 折叠为图标 + 对话 + 右栏抽屉）"
  desktop: ">= 1200px（SideNav 220px + 对话弹性 + 右栏 360px，内容区最大 1440px 居中）"

components:
  # ───────────── Basics：无业务含义的最小单元 ─────────────
  basics:
    Button:
      description: "所有触发动作的地方。一屏最多一个 primary；删除 / 注销这类慎重操作用 danger，并与“取消”同等尺寸，不做成醒目主按钮。"
      variants:
        primary: { bg: "colors.primary.6", text: "#FFFFFF", hover-bg: "colors.primary.5", active-bg: "colors.primary.7" }
        secondary: { bg: "colors.neutral.bg-container", text: "colors.neutral.text-primary", border: "colors.neutral.border", hover-bg: "colors.neutral.bg-layout" }
        ghost: { bg: "transparent", text: "colors.primary.6", hover-bg: "colors.primary.1" }
        danger: { bg: "colors.neutral.bg-container", text: "colors.status.error.6", border: "colors.status.error.6", hover-bg: "colors.status.error.1" }
      sizes:
        sm: { height: "28px", padding: "0 spacing.sm", font: "typography.caption" }
        md: { height: "36px", padding: "0 spacing.md", font: "typography.body-md" }
        lg: { height: "44px", padding: "0 spacing.lg", font: "typography.body-lg" }
      states: { disabled: { opacity: "0.45", cursor: "not-allowed" }, loading: { content: "Spinner + 原文案" } }
      radius: "rounded.sm"
    IconButton:
      description: "只有图标的按钮：发送、关闭、更多（⋯）、返回。必须带 aria-label。"
      variants:
        filled: { bg: "colors.primary.6", icon: "#FFFFFF" }
        plain: { bg: "transparent", icon: "colors.neutral.text-secondary", hover-bg: "colors.neutral.bg-layout" }
      sizes: { sm: "28px", md: "36px", lg: "44px" }
      states: { disabled: { bg: "colors.neutral.divider", icon: "colors.neutral.text-disabled" } }
      radius: "rounded.full"
    Input:
      description: "单行输入（注册表单、搜索、编辑画像、密码确认）。错误、禁用是 states，不是另一个组件。"
      height: "40px"
      bg: "colors.neutral.bg-container"
      border: "colors.neutral.border"
      placeholder: "colors.neutral.text-disabled"
      focus-border: "colors.primary.6"
      variants:
        default: {}
        search: { prefix-icon: "search", bg: "colors.neutral.bg-layout", border: "transparent" }
        password: { suffix-icon: "eye" }
      states:
        error: { border: "colors.status.error.6", helper-text: "colors.status.error.6" }
        disabled: { bg: "colors.neutral.bg-layout", text: "colors.neutral.text-disabled" }
      radius: "rounded.sm"
    TextArea:
      description: "多行输入，随内容自动增高（最多 6 行后滚动）。用于对话输入框。"
      min-rows: 1
      max-rows: 6
      states: { disabled: { bg: "colors.neutral.bg-layout" } }
      radius: "rounded.md"
    SegmentedControl:
      description: "两到三个互斥选项的切换：记录 / 提问、1 层 / 2 层、画像 / 关系 / 记录。"
      bg: "colors.neutral.bg-layout"
      active-bg: "colors.neutral.bg-container"
      active-text: "colors.primary.6"
      text: "colors.neutral.text-secondary"
      sizes: { sm: { height: "28px" }, md: { height: "32px" } }
      radius: "rounded.full"
    DatePicker:
      description: "发生日期选择。支持年 / 月 / 日三种精度，未来日期不可选。以 Chip 形态触发，弹出底部抽屉。"
      variants:
        precision-day: { display: "2026-11-16 / 今天" }
        precision-month: { display: "2026 年 11 月" }
        precision-year: { display: "2015 年" }
      states: { disabled-future: { text: "colors.neutral.text-disabled" } }
    Chip:
      description: "紧凑的标签或可点选项：人物 chip、筛选条件、性格标签、候选人。可选中、可移除、可点击跳转。"
      height: "24px"
      padding: "0 spacing.sm"
      font: "typography.caption"
      variants:
        neutral: { bg: "colors.neutral.bg-container", text: "colors.neutral.text-primary", border: "colors.neutral.border" }
        selected: { bg: "colors.primary.1", text: "colors.primary.7", border: "colors.primary.6" }
        danger: { bg: "colors.status.error.1", text: "colors.status.error.6", border: "colors.status.error.6" }
        warning: { bg: "colors.status.warning.1", text: "colors.status.warning.6" }
      options: { removable: "尾部 ✕", link: "尾部 ›，整块可点" }
      radius: "rounded.full"
    Badge:
      description: "未读红点或数量角标（待确认的草稿、底部 tab）。"
      variants:
        dot: { size: "8px", bg: "colors.status.error.6" }
        count: { min-width: "16px", bg: "colors.status.error.6", text: "#FFFFFF", font: "typography.caption" }
    Avatar:
      description: "人物头像。没有照片时显示姓氏首字。本人有“我”标记。"
      variants:
        initial: { bg: "colors.secondary.1", text: "colors.secondary.7" }
        self: { bg: "colors.primary.1", text: "colors.primary.7", ring: "colors.primary.6" }
      sizes: { sm: "24px", md: "36px", lg: "56px" }
      radius: "rounded.full"
    Divider:
      description: "分割线。组内用细线，组间靠间距（spacing.lg）区分。"
      color: "colors.neutral.divider"
      variants: { full: {}, inset: { margin-left: "spacing.md" } }
    Modal:
      description: "需要明确决定的居中弹窗：删除人物、放弃草稿。按钮同等宽度，左取消右动作。"
      bg: "colors.neutral.bg-container"
      mask: "rgba(31, 36, 48, 0.45)"
      width: "min(320px, 100vw - 48px)"
      variants:
        confirm: { action: "Button.primary" }
        danger: { action: "Button.danger" }
      radius: "rounded.lg"
    Drawer:
      description: "足不出户的承载面。移动端从底部升起，桌面端变成右栏面板。"
      bg: "colors.neutral.bg-container"
      variants:
        bottom-sheet: { handle: "36x4px rounded.full colors.neutral.border", max-height: "92vh", radius-top: "rounded.lg" }
        side-panel: { width: "360px", border-left: "colors.neutral.divider", desktop: "≥1200px 时为页面布局内的非模态右栏：无遮罩、页面可继续操作；打开时焦点进入、关闭时回到触发处；✕ 关闭，Esc 仅在焦点位于面板内时关闭。768–1199px 为模态右侧抽屉，<768px 用 bottom-sheet" }
      transition: "transform 240ms cubic-bezier(0.2, 0, 0, 1)"
    Tooltip:
      description: "截断文本 hover 时显示全称；出处标记 hover 时显示摘要。"
      bg: "colors.neutral.text-primary"
      text: "colors.neutral.bg-container"
      radius: "rounded.sm"
    Toast:
      description: "轻量的操作结果反馈（已复制、已删除），2 秒后自动消失。与 Tooltip 同一深色表面。"
      bg: "colors.neutral.text-primary"
      text: "colors.neutral.bg-container"
      radius: "rounded.md"
      variants: { info: {}, success: { icon: "check" }, error: { icon: "alert" } }
    Banner:
      description: "页面内的状态横幅：额度用完、网络异常。"
      variants:
        warning: { bg: "colors.status.warning.1", text: "colors.status.warning.6" }
        error: { bg: "colors.status.error.1", text: "colors.status.error.6" }
        info: { bg: "colors.status.info.1", text: "colors.status.info.6" }
      radius: "rounded.md"
    Skeleton:
      description: "加载占位，描出加载后的结构。"
      bg: "colors.neutral.divider"
      animation: "shimmer 1.4s ease-in-out infinite"
      variants: { text: { height: "12px" }, avatar: { shape: "circle" }, card: { radius: "rounded.md" } }

  # ───────────── Composites：基础组件组合，可复用、无具体业务 ─────────────
  composites:
    NavBar:
      description: "移动端顶栏：标题 + 可选副标题 + 左返回 + 右侧操作（文字或 ⋯）。"
      height: "48px"
      bg: "colors.neutral.bg-container"
      variants: { root: { left: "none" }, pushed: { left: "IconButton.plain back" } }
    TabBar:
      description: "移动端底部导航：对话 / 人物 / 我的。可带 Badge.dot。"
      height: "56px + safe-area"
      active: "colors.primary.6"
      inactive: "colors.neutral.text-secondary"
    SideNav:
      description: "桌面端左侧导航：对话 / 人物 / 全景图 / 我的，下方是“最近提到”的人物列表。宽度固定 220px。"
      bg: "colors.neutral.bg-layout"
      item-active: { bg: "colors.primary.1", text: "colors.primary.7" }
    ListItem:
      description: "列表行：前置（头像 / 图标）+ 主文 + 副文 + 尾部（文字 / 数字右对齐 / ›）。整行可点，hover 整行高亮。"
      min-height: "56px"
      hover-bg: "colors.neutral.bg-layout"
      variants: { default: {}, with-avatar: {}, navigational: { trailing: "›" }, value: { trailing: "右对齐数字" } }
    SectionHeader:
      description: "列表或页面分区标题（至交 · 2、画像、事实时间线），可带右侧操作。"
      font: "typography.caption"
      color: "colors.neutral.text-secondary"
    FormRow:
      description: "表单行：标签右对齐 + 输入框左对齐；窄屏（< 360px）改为上下堆叠。标签最大宽度 96px。"
      label-align: "right"
      gap: "spacing.sm"
    EmptyState:
      description: "空状态：插画 + 一句话 + 引导按钮。"
      variants:
        first-use: { illustration: "两条交织的线", action: "示例记录" }
        no-people: { illustration: "空的人物卡", action: "去记一笔" }
        not-found: { illustration: "问号", action: "回到人物列表" }
    Card:
      description: "内容容器。"
      bg: "colors.neutral.bg-container"
      border: "colors.neutral.divider"
      radius: "rounded.md"
      padding: "spacing.md"
      variants: { plain: {}, outlined: {}, highlighted: { border: "colors.primary.6" } }
    Timeline:
      description: "纵向时间线：圆点 + 时间 + 内容。圆点颜色区分当前 / 失效 / 待核实。"
      variants:
        current: { dot: "colors.primary.6" }
        invalidated: { dot: "colors.neutral.text-disabled", text: "line-through colors.neutral.text-secondary" }
        unverified: { dot: "colors.status.warning.6" }

  # ───────────── Business：带 Weft 业务含义的组件 ─────────────
  business:
    ChatComposer:
      description: "对话页底部的输入区：记录 / 提问切换（SegmentedControl）+ 发生日期（DatePicker，仅记录模式）+ 自动增高输入框 + 发送。提问发出后自动切回记录。"
      variants:
        record: { placeholder: "今天和谁发生了什么？", date-chip: true }
        ask: { placeholder: "想问关于谁的什么事？", date-chip: false }
      states:
        quota-exhausted: { input: "TextArea.disabled", send: "IconButton.disabled", banner: "Banner.warning" }
        sending: { send: "IconButton loading" }
    MessageBubble:
      description: "对话中的用户消息，右对齐，下方显示类型与日期（记录 · 11-16 / 提问）。"
      bg: "colors.primary.1"
      text: "colors.neutral.text-primary"
      max-width: "78%"
      radius: "rounded.lg（右下角 rounded.sm）"
      variants: { record: { meta: "记录 · 发生日期" }, question: { meta: "提问" } }
    DraftCard:
      description: "对话里的草稿卡片，一条记录一张，状态变化原地更新。"
      variants:
        extracting: { body: "Skeleton.text x3", title: "正在整理人物和关系…" }
        pending: { body: "人物 chip + 前 3 条信息 + 还有 N 条", action: "Button.primary 查看并确认" }
        failed: { bg: "colors.status.error.1", action: "Button.secondary 重试" }
        confirmed: { body: "✓ 已入图谱 · N 条信息 · 学到的别名", action: "人物 Chip.link" }
        discarded: { text: "colors.neutral.text-secondary", body: "已放弃" }
    DraftReviewSheet:
      description: "确认草稿的承载面（移动端 Drawer.bottom-sheet，桌面端 Drawer.side-panel）。分区：涉及的人物 / 信息 / 关系变化 / 感受变化 / 画像变化；底部 放弃 + 确认入图谱，存在未选的需选择项时确认禁用。"
    PersonMatchItem:
      description: "草稿里一个被提到的人怎么对上号。"
      variants:
        matched: { trailing: "Chip.selected 已匹配", detail: "老张 → 张伟（同事）" }
        ambiguous: { title-color: "colors.status.error.6", body: "候选人 Chip 列表 + “新人物” Chip" }
        new: { trailing: "Chip.selected 新人物" }
    DraftFactItem:
      description: "草稿里一条待写入的信息，可改可信度、可删除。"
      variants:
        add: {}
        update: { detail: "将更新：旧值 → 新值" }
        unverified: { detail: "与已有信息冲突且可信度更低，标为待核实", accent: "colors.status.warning.6" }
      options: { confidence: "ConfidenceBadge 可点选", removable: true }
    ConfidenceBadge:
      description: "可信度四档：亲历 = 主色靛蓝，本人说 = 辅色青绿，转述 = 警告黄，推测 = 虚线灰。颜色只做辅助，文字必须完整显示（不只靠颜色区分）。"
      variants:
        witnessed: { label: "亲历", bg: "colors.primary.1", text: "colors.primary.7" }
        self_told: { label: "本人说", bg: "colors.secondary.1", text: "colors.secondary.7" }
        hearsay: { label: "转述", bg: "colors.status.warning.1", text: "colors.status.warning.6" }
        inferred: { label: "推测", bg: "colors.neutral.bg-layout", text: "colors.neutral.text-secondary", border: "dashed colors.neutral.border" }
      radius: "rounded.full"
    AnswerCard:
      description: "问答的回答，正文内嵌 CitationMark，下方是相关人物 Chip 与追问建议。"
      bg: "colors.neutral.bg-container"
      variants:
        text: {}
        path: { body: "PathChain" }
        list: { body: "人物行列表，每行带 CitationMark" }
        stat: { body: "大号数字（右对齐）+ 对应人物列表" }
        no-answer: { body: "图谱里没有相关信息 + Button.secondary 去记一笔" }
    CitationMark:
      description: "回答中的出处标记 [n]，可点开 CitationSheet，hover 显示 Tooltip 摘要。"
      text: "colors.primary.6"
      hover-bg: "colors.primary.1"
      font: "typography.caption 上标"
    CitationSheet:
      description: "出处详情：ConfidenceBadge + 记录原文引用 + 发生日期 + 跳转到相关关系。移动端 bottom-sheet，桌面端右栏。"
    PathChain:
      description: "人脉路径：Avatar + 姓名，用箭头串联（我 → 张伟 → 王芳），每段可点。"
    PersonRow:
      description: "人物列表行：Avatar + 姓名（别名）+ 关系 · 最近提到时间 + ›。长名单行截断加 Tooltip。"
      variants: { default: {}, self: { avatar: "Avatar.self", label: "（我）", chevron: false } }
    PersonHeader:
      description: "人物页顶部：姓名、别名、与我的关系摘要（类型 · 认识时长 · 亲密度）+ 编辑 / ⋯ 菜单。"
    ProfileSection:
      description: "画像的一个分区，每条信息可点开出处，可就地编辑。"
      variants:
        roles: { item: "单位 / 学校 / 城市 + 时间段", history: "折叠的历史列表" }
        tags: { item: "Chip.neutral（性格、喜好、厌恶）", editable: "Chip removable + 添加" }
        notes: { item: "短文本（生活事件、相处之道）" }
        opinion: { label: "我的评价", style: "斜体 + colors.secondary.6 左边线，与事实区分" }
        summary: { item: "综合描述 + 生成时间", bg: "colors.neutral.bg-layout" }
      states: { empty: { text: "colors.neutral.text-secondary", body: "还没有记录" }, editing: { item: "Input / Chip removable" } }
    RelationshipTypeTag:
      description: "关系类型：大类 · 小类，附原话（“铁哥们”）。自定义小类带小标记。"
      variants: { builtin: { style: "Chip.neutral" }, custom: { style: "Chip.neutral + 自定义角标" } }
    RelationshipOverview:
      description: "关系页顶部的关系概览：关系类型（RelationshipTypeTag，可多个）+ RelationStatusTag + 认识时间（带精度）+ 认识途径 + 介绍人（PersonRow 链接，可点击跳转）+ 一段总结；第三方关系附 ConfidenceBadge。缺失的字段显示“未记录”，不隐藏。"
      variants: { self-pair: { title: "我和他" }, third-party: { title: "A 与 B", confidence: "ConfidenceBadge" } }
    RelationStatusTag:
      description: "关系当前状态。"
      variants:
        active: { label: "活跃", style: "Chip 绿（status.success）" }
        distant: { label: "疏远", style: "Chip 灰" }
        tense: { label: "紧张", style: "Chip.danger" }
        estranged: { label: "断联", style: "Chip 灰 + 虚线边" }
    FeelingRow:
      description: "一个方向的感受（A → B）：亲密度 / 好恶 / 信任 档位 + 历史展开。未记录的维度不显示，整行未记录时显示“（未记录）”。"
      states: { expanded: { body: "Timeline 显示每次变化" } }
    FactTimeline:
      description: "两人之间事实的时间线，复用 Timeline 的 current / invalidated / unverified 变体，每条带 ConfidenceBadge。"
    RelationGraph:
      description: "以“我”为中心的关系星图。基于 Sigma.js（WebGL）+ graphology 整体使用，不拆分其内部节点 / 边为自定义组件；位置由纯函数布局计算（不用力导向），同心环、扇区线、群体光晕、流动光点画在自定义图层上。交互真源：docs/prototypes/2026-11-17-graph-viz.html。"
      library: "sigma + graphology (整体组件)"
      layout: "5 个亲密度环（至交 → 疏远，由内到外）+ 第 6 环“间接认识”；圆周按关系大类分扇区，宽度 ∝ 人数并保留最小宽度；同环同扇区成员均匀铺满扇区"
      encoding:
        edge-width: "随亲密度单调递增；两端分别取“我对他”“他对我”，不对称时画成锥形"
        edge-color: "colors.graph.<大类>（星空：colors.graph-dark.<大类>）"
        edge-dash: "转述 = 虚线 6/5，推测 = 点线 1.5/4，亲历 / 本人说 = 实线"
        tense: "colors.graph.tense"
        node: "Avatar 样式（姓氏首字），外环 = 主类型颜色，其余类型 = 外圈多色短弧；有转述信息时右上角 warning 色小圆点"
        group-halo: "同群体 ≥ 2 人时成员背后的径向渐变光晕 + 群体名；< 768px 不画"
      variants:
        local: { hops: "1 | 2", max-nodes: 50, height: "200px（移动端）" }
        panorama: { center: "本人", filter: "GraphFilterSheet", timeline: "GraphTimeline", legend: "GraphLegend", list: "GraphListView", gestures: "单指拖动、双指缩放、滚轮缩放" }
      themes:
        light: "名称“浅色”：colors.graph + DESIGN.md 中性色，白底"
        starfield: "colors.graph-dark：径向渐变深底、闪烁星点、节点与连线同色发光、亲近及以上连线上缓慢流动的光点（< 768px 不画光点）"
      states:
        focused: { rule: "点人物：他、本人、直接相连的人与连线保持，其余淡到 colors.graph.fade，200ms 过渡；同时显示人物卡片（Card + Chip）" }
        answer-highlight: { path: "按顺序逐段点亮，每段约 0.7s，光点沿路径流动，颜色 colors.graph.path", list: "命中人物脉冲光圈", pair: "点亮两人连线并标出关系" }
        filtered: { modes: "淡化不符合的人 | 只显示符合的人" }
        time-travel: { rule: "只显示该时间点已认识的人，落在那时的亲密度环；变化时沿径向平滑移动" }
        truncated: { banner: "已省略 N 人，仅显示亲密度最高的 50 人（local）；超过 500 人提示先筛选（panorama）" }
        reduced-motion: { rule: "所有过渡、路径动画、脉冲、星点闪烁、流动光点改为直接切换或静止" }
      labels: "缩放低于阈值只显示亲近及以上人名（手机：至交）；超过 7 字截断 + Tooltip"
      a11y: "画布有可读名称；始终配套 GraphListView 作为可键盘浏览的替代"
    GraphTimeline:
      description: "全景图底部时间轴：范围从最早认识时间到今天；Slider + 播放 / 暂停 IconButton + 当前年份（数字右对齐）。播放约每秒 1.5 年，到今天自动停止；减少动效时逐年跳转。"
      states: { playing: { icon: "pause" }, paused: { icon: "play" }, at-today: { label: "今天" } }
    GraphLegend:
      description: "图例：线粗 = 亲密度、颜色 = 关系大类、虚线 = 转述、点线 = 推测、红色 = 紧张、两端粗细不同 = 感受不对称、光晕 = 群体。可收起。"
      variants: { expanded: {}, collapsed: { trigger: "Chip 图例" } }
    GraphListView:
      description: "图谱的列表替代视图：按环（亲密度）与扇区（大类）分组列出人物与关系，复用 ListItem / PersonRow；聚焦与问答高亮在列表中同步体现；键盘可达。"
    GraphAppearanceSetting:
      description: "“我的”页设置项：图谱外观 浅色 / 星空（SegmentedControl），保存到账户。"
    GraphFilterSheet:
      description: "全景图筛选：关系大类 / 小类 Chip 多选 + 亲密度档位单选。"
    EntryListItem:
      description: "记录列表行：原文（两行截断）+ 发生日期（含精度）+ 信息数量 + 状态。"
      variants:
        confirmed: { status: "已确认", color: "colors.neutral.text-secondary" }
        pending: { status: "待确认", color: "colors.status.error.6", badge: "Badge.dot" }
        discarded: { status: "已放弃", color: "colors.neutral.text-secondary" }
        failed: { status: "整理失败", color: "colors.status.error.6" }
    QuotaMeter:
      description: "今日额度：记录 x / 50、提问 x / 100，数字右对齐；剩余不足 10% 时变为 warning 色。"
      variants: { normal: {}, low: { text: "colors.status.warning.6" }, exhausted: { text: "colors.status.error.6" } }
    TaxonomyEditor:
      description: "关系类型词表：五个大类分组，每组列出小类，可在组内用 Input 新增自定义小类。"
---

# Weft Design System（2026-11 改版：对话感）

> 交互与视觉真源：`docs/prototypes/2026-11-18-style-refresh.html`（方案 A）。前一版“清蓝”见 git 历史与 `docs/design/DESIGN.v2-indigo.md`。

## 1. 原则：简洁、耐用、易用、大大方方
- **一屏一个焦点**：对话页是输入框，人物页是姓名与综合描述，弹窗里是主操作。其余元素让路。
- **层级靠字号、字重、留白，不靠框和色块**：页标题 `h1` 24/32；分区标题 `section` 13 半粗、三级灰；正文 `body-md` 15/24；元信息 `meta` 13。分区之间 24px，组内 8px。
- **白底，内容直接铺开**：页面不用卡片套卡片。只有三种面：白色页面、`bg-subtle` 弱分区（侧栏、已入图谱的草稿、综合描述）、浮层（抽屉 / 弹窗，带 `shadow.lg`）。
- **近黑主色，彩色只给状态**：`primary` 只用于主按钮、当前 tab / 选中态、焦点环。链接与图标按钮用中性灰；标签默认 `bg-muted` 底、无描边；绿 / 黄 / 红 / 蓝只出现在“活跃 / 转述·待核实 / 紧张·危险 / 信息”这类状态上。关系图谱按 `colors.graph` 分类着色，属于数据可视化，不受此限。
- **桌面限宽**：主内容 `max-width: 720px` 居中；右栏 380px；侧栏 232px（`bg-subtle`）。
- **少而准的文案**：用自然语句（“张伟喜欢钓鱼”），不拼接字段（“张伟 · 喜欢 钓鱼”）；任何内部字段名（如 RELATED_EVENT）不得出现在界面上。
- **空内容折叠**：没有内容的画像分区不逐个显示“还没有记录”，合并成一行“还可以补充：生日、籍贯……”（可点）。

## 2. 对话页（参考豆包）
- 输入框是视觉焦点：`rounded.xl`、`border`、`shadow.md`，聚焦 `shadow.lg`；内含“记录 | 提问”小分段、日期（仅记录模式）、圆形近黑发送按钮（空内容时 25% 不透明）。
- 用户消息：`bg-muted` 气泡，`rounded.bubble`，右对齐，下方 12px 元信息。
- 回答：**不套卡片**，正文直接排在白底上；出处 `[n]` 为 `bg-muted` 小方块；相关人物为头像 chip；“在图上查看”为中性文字按钮。
- 草稿卡：白底 + `divider` 细边 + `rounded.md`；确认后变 `bg-subtle` 无边、内容收起，只剩“✓ 已入图谱 · N 条信息”。

## 3. 动效（少而有用，见 `motion` token）
| 场景 | 动效 |
| --- | --- |
| 页面切换 | 进入：淡入 + 上移 8px，`base` + decelerate；退出：淡出 `exit` |
| 抽屉 / 侧栏 / 弹窗 | 进入 `sheet` + decelerate（底部滑入 / 右侧滑入 / 缩放 0.98→1 淡入）；退出 200ms + accelerate；遮罩淡入 |
| 列表首次出现 | 逐项淡入上移，`stagger` 30ms，最多 6 项，之后的同时出现 |
| 草稿 → 已入图谱 | 卡片高度收起 + 背景过渡 `emphasis`；绿色对勾描线画出；新出现的人物 chip 轻弹（0.9→1.04→1，`base`） |
| 按下 / 悬停 | 按下缩放 `press-scale`、`fast`；悬停底色过渡 `fast` |
| 数字变化 | 额度、条数等数字从下方滚入，`emphasis` |
| 加载 | 骨架屏柔和明暗，1.6s 循环；不用转圈 |
- 只给有意义的变化加动效；高频操作（输入、滚动）不加。
- `prefers-reduced-motion: reduce` 时全部直接切换，骨架屏静止。

## 4. 可访问性
- 正文对背景 ≥ 4.5:1（上方 token 已逐一校验）；`text-disabled` 只用于占位符与禁用控件。
- 焦点环只在键盘操作时出现（`:focus-visible`），2px 近黑 + 2px 间距；打开抽屉时不得让关闭按钮呈现焦点环。
- 状态不只靠颜色：可信度、关系状态都有文字。
- 图标按钮必须有可读名称。

## 5. Do's & Don'ts
- **DO**：一屏一个主按钮；同一含义只用一个组件；文案说人话；数字右对齐并用等宽数字。
- **DON'T**：不用彩色强调非状态信息；不给回答、列表层层套框；不使用模度外的间距；不把 `RelationGraph`（Sigma.js）拆成自定义节点组件；不为高频操作加动效。
