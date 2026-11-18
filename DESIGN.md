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
  stagger-max: "6"   # 第 6 项及之后与第 6 项同时出现
  sheet-exit: "200ms" # 抽屉 / 侧栏 / 弹窗退出（accelerate）
  rise: "8px"        # 页面进入与列表入场的上移距离
  skeleton: "1.6s"   # 骨架屏柔和明暗一个循环
  press-scale: "0.98"
  reduced: "所有过渡改为直接切换；骨架屏改为静态"

breakpoints:
  mobile: "< 768px（单栏 + 底部 TabBar）"
  tablet: "768–1199px（SideNav 折叠为图标 + 对话 + 右栏抽屉）"
  desktop: ">= 1200px（SideNav 232px + 主内容最大 720px 居中 + 右栏 380px）"

components:
  # ───────────── Basics：无业务含义的最小单元 ─────────────
  basics:
    Button:
      description: "所有触发动作的地方。一屏最多一个 primary（近黑）；删除 / 注销这类慎重操作用 danger，并与“取消”同等尺寸，不做成醒目主按钮。链接式的文字操作（在图上查看、去记一笔）用 ghost，中性灰，不上色。"
      variants:
        primary: { bg: "colors.primary.6", text: "#FFFFFF", border: "colors.primary.6", hover-bg: "colors.primary.5", active-bg: "colors.primary.7" }
        secondary: { bg: "colors.neutral.bg-container", text: "colors.neutral.text-primary", border: "colors.neutral.border", hover-bg: "colors.neutral.bg-subtle" }
        ghost: { bg: "transparent", text: "colors.neutral.text-secondary", hover-bg: "colors.neutral.bg-muted", hover-text: "colors.neutral.text-primary" }
        danger: { bg: "colors.neutral.bg-container", text: "colors.status.error.6", border: "colors.neutral.border", hover-bg: "colors.status.error.1" }
      sizes:
        sm: { height: "28px", padding: "0 spacing.md", font: "typography.caption" }
        md: { height: "36px", padding: "0 spacing.md", font: "typography.body-sm" }
        lg: { height: "44px", padding: "0 spacing.lg", font: "typography.body-md" }
      font-weight: "600"
      states: { disabled: { opacity: "0.45", cursor: "not-allowed" }, loading: { content: "Spinner + 原文案" } }
      motion: { press: "scale motion.press-scale，motion.fast", hover: "底色过渡 motion.fast" }
      radius: "rounded.full"
    IconButton:
      description: "只有图标的按钮：发送、关闭、更多（⋯）、返回。必须带 aria-label。图标一律中性灰，不上色。"
      variants:
        filled: { bg: "colors.primary.6", icon: "#FFFFFF", hover-bg: "colors.primary.5" }
        plain: { bg: "transparent", icon: "colors.neutral.text-secondary", hover-bg: "colors.neutral.bg-muted", hover-icon: "colors.neutral.text-primary" }
      sizes: { sm: "28px", md: "36px", lg: "44px" }
      states: { disabled: { filled: "opacity 0.25（对话输入框空内容时的发送按钮）", plain: "icon colors.neutral.text-disabled" } }
      motion: { press: "scale motion.press-scale，motion.fast" }
      radius: "rounded.full"
    Input:
      description: "单行输入（注册表单、搜索、编辑画像、密码确认）。错误、禁用是 states，不是另一个组件。"
      height: "40px"
      padding: "0 spacing.md"
      bg: "colors.neutral.bg-container"
      border: "colors.neutral.border"
      placeholder: "colors.neutral.text-disabled"
      focus-border: "colors.neutral.text-tertiary"
      variants:
        default: { radius: "rounded.md" }
        search: { prefix-icon: "search（colors.neutral.text-tertiary）", bg: "colors.neutral.bg-muted", border: "transparent", radius: "rounded.full" }
        password: { suffix-icon: "eye" }
      states:
        error: { border: "colors.status.error.6", helper-text: "colors.status.error.6" }
        disabled: { bg: "colors.neutral.bg-subtle", text: "colors.neutral.text-disabled" }
      radius: "rounded.md"
    TextArea:
      description: "多行输入，随内容自动增高（最多 6 行后滚动）。对话页的大输入框由 ChatComposer 包一层（rounded.xl + shadow.md）。"
      min-rows: 1
      max-rows: 6
      border: "colors.neutral.border"
      focus-border: "colors.neutral.text-tertiary"
      states: { disabled: { bg: "colors.neutral.bg-subtle" } }
      radius: "rounded.md"
    SegmentedControl:
      description: "两到三个互斥选项的切换：记录 / 提问、1 层 / 2 层、浅色 / 星空。"
      bg: "colors.neutral.bg-muted"
      padding: "spacing.xs"
      active-bg: "colors.neutral.bg-container"
      active-text: "colors.neutral.text-primary（600）"
      active-shadow: "shadow.sm"
      text: "colors.neutral.text-secondary"
      sizes: { sm: { height: "28px" }, md: { height: "32px" } }
      radius: "rounded.full"
    DatePicker:
      description: "发生日期选择。支持年 / 月 / 日三种精度，未来日期不可选。触发器默认是细边透明的 Chip（divider 边，无底色）；line 触发器是一行正文“发生在：2015 年”（确认草稿顶部用），都弹出底部抽屉。"
      trigger: { bg: "transparent", border: "colors.neutral.divider", text: "colors.neutral.text-secondary" }
      cell: { hover-bg: "colors.neutral.bg-muted", selected: "colors.primary.6 底 + 白字", today: "colors.primary.6 600 字" }
      variants:
        precision-day: { display: "2026-11-16 / 今天" }
        precision-month: { display: "2026 年 11 月" }
        precision-year: { display: "2015 年" }
      states: { disabled-future: { text: "colors.neutral.text-disabled" } }
    Chip:
      description: "紧凑的标签或可点选项：人物 chip、筛选条件、性格标签、候选人。默认浅灰底、无描边；彩色只给状态。可选中、可移除、可点击跳转。"
      height: "24px"
      padding: "0 spacing.sm"
      font: "typography.caption"
      border: "none（transparent）"
      variants:
        neutral: { bg: "colors.neutral.bg-muted", text: "colors.neutral.text-secondary", hover-bg: "colors.neutral.border（可点时）" }
        selected: { bg: "colors.primary.6", text: "#FFFFFF" }
        success: { bg: "colors.status.success.1", text: "colors.status.success.6" }
        warning: { bg: "colors.status.warning.1", text: "colors.status.warning.6" }
        danger: { bg: "colors.status.error.1", text: "colors.status.error.6" }
      options: { removable: "尾部 ✕", link: "尾部 ›，整块可点" }
      motion: { press: "可点时 scale motion.press-scale，motion.fast" }
      radius: "rounded.full"
    Badge:
      description: "未读红点或数量角标（待确认的草稿、底部 tab）。"
      variants:
        dot: { size: "8px", bg: "colors.status.error.graphic" }
        count: { min-width: "16px", bg: "colors.status.error.6", text: "#FFFFFF", font: "typography.caption" }
    Avatar:
      description: "人物头像。没有照片时显示姓氏首字：浅灰底近黑字，不上色。本人显示“我”。"
      variants:
        initial: { bg: "colors.neutral.bg-muted", text: "colors.neutral.text-primary" }
        self: { bg: "colors.neutral.bg-muted", text: "colors.neutral.text-primary", glyph: "我" }
      sizes: { sm: "24px", md: "36px", lg: "56px" }
      radius: "rounded.full"
    Divider:
      description: "分割线。组内用细线，组间靠间距（spacing.lg）区分。"
      color: "colors.neutral.divider"
      variants: { full: {}, inset: { margin-left: "spacing.md" } }
    Modal:
      description: "需要明确决定的居中弹窗：删除人物、放弃草稿。按钮同等宽度，左取消右动作。"
      bg: "colors.neutral.bg-container"
      shadow: "shadow.lg"
      mask: "rgba(9, 9, 11, 0.32)"
      width: "min(320px, 100vw - 48px)"
      variants:
        confirm: { action: "Button.primary" }
        danger: { action: "Button.danger" }
      motion: { enter: "缩放 motion.press-scale → 1 + 淡入，motion.sheet + easing-decelerate", exit: "反向，motion.sheet-exit + easing-accelerate", mask: "淡入淡出" }
      focus: "打开时焦点进入（取消）；焦点环只在键盘操作时出现"
      radius: "rounded.lg"
    Drawer:
      description: "足不出户的承载面。移动端从底部升起，桌面端变成右栏面板。浮起时带 shadow.lg。"
      bg: "colors.neutral.bg-container"
      variants:
        bottom-sheet: { handle: "36x4px rounded.full colors.neutral.border", max-height: "88vh", radius-top: "rounded.xl", shadow: "shadow.lg" }
        side-panel: { width: "380px", border-left: "colors.neutral.divider", shadow: "shadow.lg（浮层时）", desktop: "≥1200px 时为页面布局内的非模态右栏：无遮罩、无阴影、页面可继续操作；打开时焦点进入、关闭时回到触发处；✕ 关闭，Esc 仅在焦点位于面板内时关闭。768–1199px 为模态右侧抽屉，<768px 用 bottom-sheet" }
      motion: { enter: "底部滑入 / 右侧滑入，motion.sheet + easing-decelerate", exit: "motion.sheet-exit + easing-accelerate", mask: "淡入淡出" }
      focus: "用鼠标或触摸打开时关闭按钮获得焦点但不显示焦点环；键盘打开时显示"
    Tooltip:
      description: "截断文本 hover 时显示全称；出处标记 hover 时显示摘要。"
      bg: "colors.neutral.text-primary"
      text: "colors.neutral.bg-container"
      shadow: "shadow.md"
      motion: "淡入 motion.base"
      radius: "rounded.sm"
    Toast:
      description: "轻量的操作结果反馈（已复制、已删除），2 秒后自动消失。与 Tooltip 同一深色表面。"
      bg: "colors.neutral.text-primary"
      text: "colors.neutral.bg-container"
      shadow: "shadow.lg"
      motion: { enter: "淡入 motion.base", exit: "淡出 motion.exit 后卸载" }
      radius: "rounded.full"
      variants: { info: {}, success: { icon: "check" }, error: { icon: "alert" } }
    Banner:
      description: "页面内的状态横幅：额度用完、网络异常。文字用状态 6 级，图标用状态 graphic 色。"
      variants:
        warning: { bg: "colors.status.warning.1", text: "colors.status.warning.6", icon: "colors.status.warning.graphic" }
        error: { bg: "colors.status.error.1", text: "colors.status.error.6", icon: "colors.status.error.graphic" }
        info: { bg: "colors.status.info.1", text: "colors.status.info.6", icon: "colors.status.info.graphic" }
      radius: "rounded.md"
    Skeleton:
      description: "加载占位，描出加载后的结构。不用转圈。"
      bg: "colors.neutral.bg-muted → colors.neutral.bg-subtle 渐变"
      animation: "柔和明暗循环 motion.skeleton（1.6s）；减少动效时静止"
      variants: { text: { height: "12px" }, avatar: { shape: "circle" }, card: { radius: "rounded.md" } }

  # ───────────── Composites：基础组件组合，可复用、无具体业务 ─────────────
  composites:
    NavBar:
      description: "移动端顶栏：标题 + 可选副标题 + 左返回 + 右侧操作（文字或 ⋯）。白底，下方不画线。"
      height: "52px"
      bg: "colors.neutral.bg-layout"
      title: "typography.h3"
      subtitle: "typography.caption colors.neutral.text-tertiary"
      variants: { root: { left: "none" }, pushed: { left: "IconButton.plain back" } }
    TabBar:
      description: "移动端底部导航：对话 / 人物 / 我的。可带 Badge.dot。顶部一条 divider 细线。"
      height: "56px + safe-area"
      active: "colors.primary.6（600）"
      inactive: "colors.neutral.text-tertiary"
    SideNav:
      description: "桌面端左侧导航：对话 / 人物 / 全景图 / 我的，下方是“最近提到”的人物列表。宽度固定 232px，弱分区底色。"
      width: "232px"
      bg: "colors.neutral.bg-subtle"
      item: { height: "40px", font: "typography.body-sm", text: "colors.neutral.text-secondary", hover-bg: "colors.neutral.bg-muted", radius: "rounded.sm" }
      item-active: { bg: "colors.neutral.bg-container", text: "colors.neutral.text-primary（600）", shadow: "shadow.sm" }
      recent: { title: "typography.caption colors.neutral.text-tertiary", item: "typography.meta colors.neutral.text-secondary" }
    ListItem:
      description: "列表行：前置（头像 / 图标）+ 主文 + 副文 + 尾部（元信息 / 数字右对齐 / ›）。整行可点。不套卡片。"
      min-height: "56px"
      title: "typography.body-md"
      subtitle: "typography.meta colors.neutral.text-tertiary"
      trailing: "typography.meta colors.neutral.text-tertiary，右对齐，等宽数字"
      chevron: "colors.neutral.text-disabled（装饰）"
      hover-bg: "colors.neutral.bg-subtle（motion.fast）"
      press: "scale motion.press-scale"
      radius: "rounded.sm（悬停底）"
      variants: { default: {}, with-avatar: {}, navigational: { trailing: "›" }, value: { trailing: "右对齐数字" } }
    SectionHeader:
      description: "列表或页面分区标题（至交 · 2、画像、数据），可带右侧操作。分区之间 spacing.lg，标题到内容 spacing.sm（由页面布局给出）。"
      font: "typography.section（13 / 20，600）"
      color: "colors.neutral.text-tertiary"
    FormRow:
      description: "表单行：标签右对齐 + 输入框左对齐；窄屏（< 360px）改为上下堆叠。标签最大宽度 96px。"
      label: "typography.body-sm colors.neutral.text-secondary"
      label-align: "right"
      gap: "spacing.sm"
    EmptyState:
      description: "空状态：插画 + 一句话 + 引导按钮。插画只用近黑与灰（bg-subtle 底块），不上色。"
      title: "typography.h3"
      description-text: "typography.body-sm colors.neutral.text-tertiary"
      examples: "细边（divider）白底按钮，悬停 bg-subtle，按下缩放；列表错开入场"
      action: "Button.secondary"
      variants:
        first-use: { illustration: "两条交织的线", action: "示例记录" }
        no-people: { illustration: "空的人物卡", action: "去记一笔" }
        not-found: { illustration: "问号", action: "回到人物列表" }
    Card:
      description: "内容容器，只用在 DESIGN.md 允许的地方：草稿卡、图谱上浮起的人物卡。回答、列表不套卡片。无阴影。"
      bg: "colors.neutral.bg-container"
      border: "colors.neutral.divider"
      radius: "rounded.md"
      padding: "spacing.md"
      variants: { plain: { border: "none" }, outlined: {}, highlighted: { border: "colors.primary.6（选中态）" } }
    Timeline:
      description: "纵向时间线：圆点 + 时间 + 内容。圆点颜色区分当前 / 失效 / 待核实，状态同时写成文字。"
      time: "typography.caption colors.neutral.text-tertiary，等宽数字"
      variants:
        current: { dot: "colors.primary.6" }
        invalidated: { dot: "colors.neutral.text-disabled", text: "line-through colors.neutral.text-secondary" }
        unverified: { dot: "colors.status.warning.graphic", label: "colors.status.warning.6 待核实" }

  # ───────────── Business：带 Weft 业务含义的组件 ─────────────
  business:
    ChatComposer:
      description: "对话页底部的输入区，页面的视觉焦点：一个 rounded.xl + border + shadow.md 的框（聚焦 shadow.lg），框内只有自动增高的输入（TextArea.bare，无自身边框）和右侧圆形近黑发送（空内容 25% 不透明）。没有“记录 / 提问”切换，也没有日期：发什么由系统按意图分发，发生日期从原话里读（ADR 0005）。占位“记点什么，或问点什么……”。桌面与内容同宽（720 居中）。"
      placeholder: "记点什么，或问点什么……"
      states:
        one-quota-exhausted: { banner: "Banner.warning（今日已达上限：…·另一类还剩 N）", input: "仍可发送（另一类不受影响）" }
        both-quotas-exhausted: { input: "TextArea.disabled", send: "IconButton.disabled", banner: "Banner.warning" }
        sending: { send: "IconButton loading", feed: "先显示用户气泡 + “正在处理…”骨架" }
    MessageBubble:
      description: "对话中的用户消息，右对齐；下方一行元信息说明这条消息被怎么处理（记录 · 11-16 / 提问 / 记录 · 今天 · 提问；无关消息不显示），行尾接 MessageActions（纠正按钮）。"
      bg: "colors.neutral.bg-muted"
      text: "colors.neutral.text-primary"
      max-width: "78%"
      radius: "rounded.bubble"
      variants: { record: { meta: "记录 · 发生日期" }, question: { meta: "提问" }, both: { meta: "记录 · 发生日期 · 提问" }, plain: { meta: "无" } }
    MessageActions:
      description: "消息下方的低调文字按钮行（意图纠正，intent-routing AC-6 / AC-10）。用户气泡下：已按记录处理且草稿未确认 → “改为提问”；已按提问处理 → “改为记录”；记录 + 提问 → 不显示。无关消息的回应下：“记下来 / 帮我查”；反问下：候选（见 ClarifyReply，长文字可换行）。点击后原消息按另一种方式重新处理并原地替换。不上色、不加框，永远比消息本身安静。"
      button: "Button.ghost sm（28px、caption 字号、neutral.text-secondary，悬停 bg-muted + text-primary）"
      layout: "气泡下：与元信息同一行、右对齐；无关回应下：左对齐"
      states:
        pending: { clicked: "Button loading（转圈）", others: "disabled" }
        error: { feedback: "Toast.error（409 已确认 / 不能改、429 额度用完、503 问答不可用）" }
    ChitchatReply:
      description: "对无关消息（寒暄、道谢、拿不准）的简短回应：像回答一样不套卡片，一句 body-md 正文直接排在白底上；拿不准且没有可用反问时固定为“我没确定你是想记下来还是查询”（有反问时换成 ClarifyReply）；下方 MessageActions “记下来 / 帮我查”。不建记录、不查图谱、不扣额度。"
    ClarifyReply:
      description: "对拿不准消息的反问（intent-clarify AC-1 / AC-3）：占无关回应的位置，同样不套卡片——一句 body-md 正文写出具体的反问（带上原话里的人和事），下方 MessageActions 列出 1–3 个候选（“记下：…”“查：…”），按钮名即候选原文。用户点候选，或直接在输入框里打字回答（不需要专门入口）。已解决（点过候选，或被下一条消息回答）后只留反问这句话，候选隐藏；点过候选的消息照常显示处理结果（草稿卡 / 回答）和纠正按钮。反问本身不扣额度。"
      layout: "左对齐，按钮行 -ml-md 与正文对齐；候选文字较长时按钮换行（h-auto、左对齐），375px 下不溢出"
      states:
        open: { question: "body-md neutral.text-primary", options: "Button.ghost sm（同 MessageActions）" }
        pending: { clicked: "Button loading（转圈）", others: "disabled", below: "查类候选显示“正在图谱里查找…”骨架" }
        resolved: { question: "保留", options: "隐藏" }
        error: { feedback: "Toast.error（429 额度用完：同输入框的额度文案，反问保持未解决；409 已处理：刷新消息；503 问答不可用）" }
    DraftCard:
      description: "对话里的草稿卡片，一条记录一张，状态变化原地更新（同一 DOM 节点）。白底 + divider 细边 + rounded.md，无阴影；信息行为自然语句 + 行尾灰色可信度（“**张伟**喜欢钓鱼 · 本人说”）。"
      variants:
        extracting: { body: "Skeleton.text x3", title: "正在整理人物和关系…" }
        pending: { body: "人物 chip（头像 + “老张 是 张伟”）+ 前 3 条信息 + 还有 N 条", action: "Button.primary 查看并确认" }
        failed: { bg: "colors.status.error.1", action: "Button.secondary 重试" }
        confirmed: { bg: "colors.neutral.bg-subtle（无边）", body: "绿色对勾 + 已入图谱 · N 条信息 · 学到的别名", action: "人物头像 Chip" }
        discarded: { text: "colors.neutral.text-secondary", body: "已放弃" }
      motion: { confirm: "确认抽屉退出（motion.sheet-exit）后：预览以 grid-template-rows 1fr→0fr 收起、底色过渡到 bg-subtle（motion.emphasis）；对勾 stroke-dashoffset 画出；新人物 chip 轻弹（pop，motion.base，错开 motion.stagger）。页面加载时已是已入图谱的卡不播放。减少动效：直接切换，对勾直接显示。" }
    DraftReviewSheet:
      description: "确认草稿的承载面（移动端 Drawer.bottom-sheet，桌面端 Drawer.side-panel 380）。顶部第一行“发生在：<日期>”（按精度：2015 年 / 2026 年 3 月 / 今天；DatePicker 的 line 触发器，正文字号、日期半粗、尾部灰色日历图标），点按打开 DatePicker（年 / 月 / 日，不可选未来）；改后草稿里依赖发生日期的时间由服务端重新换算，行下出现 meta 灰色提示“已按新的发生日期重新换算草稿里的时间，请检查一遍”。分区：涉及的人物 / 信息 / 画像变化 / 关系变化 / 感受变化，每条为自然语句（lib/draft itemSentence）；末尾提示“点一条可以改可信度”；底部 放弃 + 确认入图谱 等宽并排（确认为主按钮），存在未选的需选择项时确认禁用。"
    PersonMatchItem:
      description: "草稿里一个被提到的人怎么对上号。"
      layout: "Avatar.md + 自然语句 + 尾部状态 chip"
      variants:
        matched: { title: "老张 是 张伟（“是”为 meta 灰）", detail: "同事（meta）", trailing: "Chip.success 已匹配" }
        ambiguous: { title: "小李 是谁？（colors.status.error.6）", trailing: "Chip.danger 需选择", body: "候选人 Chip 列表 + “＋ 新人物” Chip.selected" }
        new: { detail: "图谱里还没有这个人", trailing: "Chip.neutral 新人物" }
    DraftFactItem:
      description: "草稿里一条待写入的信息：自然语句 + 行尾灰色可信度（ConfidenceBadge.sentence），整行可点改可信度；尾部 ✕ 删除。无分隔线。"
      variants:
        add: {}
        update: { detail: "将更新：旧值 → 新值（meta 灰）" }
        unverified: { detail: "待核实（Chip.warning）+ 与已有信息冲突且可信度更低（colors.status.warning.6）" }
      options: { confidence: "整行可点选", removable: true }
    ConfidenceBadge:
      description: "可信度四档，写在信息行尾的灰色元信息文字（typography.meta），无底色无描边；文字必须完整显示（不只靠颜色区分）。sentence 布局：“张伟喜欢钓鱼 · 本人说”，可改时整行是按钮、点按弹出四档菜单（悬停 bg-muted；菜单淡入 motion.base、淡出 motion.exit）。"
      variants:
        witnessed: { label: "亲历", text: "colors.neutral.text-tertiary" }
        self_told: { label: "本人说", text: "colors.neutral.text-tertiary" }
        hearsay: { label: "转述", text: "colors.status.warning.6" }
        inferred: { label: "推测", text: "colors.neutral.text-tertiary", border: "dashed colors.neutral.border" }
      radius: "rounded.full"
    AnswerCard:
      description: "问答的回答，不套卡片（无底色、无边、无阴影），正文 15/26 直接排在白底上，内嵌 CitationMark；下方是相关人物头像 Chip、“在图上查看”（Button.ghost 中性灰）与追问建议（中性灰文字）。"
      bg: "transparent"
      variants:
        text: {}
        path: { body: "PathChain" }
        list: { body: "人物行列表，每行带 CitationMark" }
        stat: { body: "大号数字（右对齐）+ 对应人物列表" }
        no-answer: { body: "图谱里没有相关信息 + Button.secondary 去记一笔" }
    CitationMark:
      description: "回答中的出处标记：18px 的 bg-muted 小方块（圆角 6px）里写数字，可点开 CitationSheet，hover 显示 Tooltip 摘要。"
      bg: "colors.neutral.bg-muted"
      text: "colors.neutral.text-secondary"
      hover-bg: "colors.neutral.border"
      font: "typography.caption"
    CitationSheet:
      description: "出处详情：ConfidenceBadge + 记录原文引用 + 发生日期 + 跳转到相关关系。移动端 bottom-sheet，桌面端右栏。"
    PathChain:
      description: "人脉路径：Avatar + 姓名，用箭头串联（我 → 张伟 → 王芳），每段可点。"
    PersonRow:
      description: "人物列表行：Avatar + 姓名（别名）+ 关系 · 最近提到时间 + ›。长名单行截断加 Tooltip。"
      variants: { default: {}, self: { avatar: "Avatar.self", label: "（我）", chevron: false } }
    PersonHeader:
      description: "人物页顶部，直接排在页面上（无边无底）：大头像（Avatar.lg）+ 姓名（h1，24/32 半粗）+ 一句话关系（别名 · 关系类型 · 认识时长，meta 灰）+ 最多 2 个标签（RelationStatusTag、亲密度 · 信任 Chip.neutral）；右侧 编辑 / ⋯ 菜单。在对话右栏中姓名为 h2。"
    ProfileSection:
      description: "画像的一个分区，每条信息可点开出处，可就地编辑。"
      variants:
        roles: { item: "单位 / 学校 / 城市 + 时间段", history: "折叠的历史列表" }
        tags: { item: "Chip.neutral（性格、喜好、厌恶）", editable: "Chip removable + 添加" }
        notes: { item: "短文本（生活事件、相处之道）" }
        opinion: { label: "我的评价", style: "斜体 + colors.secondary.6 左边线，与事实区分" }
        summary: { item: "综合描述（15/26）+ 生成时间（meta）", bg: "colors.neutral.bg-subtle", radius: "rounded.md" }
      states:
        empty: { body: "不渲染；页面把所有空分区与缺失的身份字段折叠成一行 ProfileSectionFold：“还可以补充：生日、籍贯、相处之道”（meta 灰，各项为可点的近黑下划线文字，点开就地编辑并聚焦该项）" }
        editing: { item: "Input / Chip removable + 添加" }
    RelationshipTypeTag:
      description: "关系类型：大类 · 小类，附原话（“铁哥们”）。自定义小类带小标记。"
      variants: { builtin: { style: "Chip.neutral" }, custom: { style: "Chip.neutral + 自定义角标" } }
    RelationshipOverview:
      description: "关系页顶部的关系概览：关系类型（RelationshipTypeTag，可多个）+ RelationStatusTag + 认识时间（带精度）+ 认识途径 + 介绍人（PersonRow 链接，可点击跳转）+ 一段总结；第三方关系附 ConfidenceBadge。缺失的字段显示“未记录”，不隐藏。"
      variants: { self-pair: { title: "我和他" }, third-party: { title: "A 与 B", confidence: "ConfidenceBadge" } }
    RelationStatusTag:
      description: "关系当前状态。状态标签用状态色浅底 + 6 级文字，无描边。"
      variants:
        active: { label: "活跃", style: "Chip.success" }
        distant: { label: "疏远", style: "Chip.neutral（bg-muted）" }
        tense: { label: "紧张", style: "Chip.danger" }
        estranged: { label: "断联", style: "无底色灰字 + dashed colors.neutral.border" }
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
      description: "今日额度：列表行“记录 12 / 50”“提问 63 / 100”，数字右对齐等宽，“/ 50”为 meta 灰；已用数变化时从下方滚入（motion.emphasis，首屏不播放）；剩余不足 10% 时变为 warning 色。"
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
- 输入框是视觉焦点：`rounded.xl`、`border`、`shadow.md`，聚焦 `shadow.lg`；只有输入区和圆形近黑发送按钮（空内容时 25% 不透明）。没有“记录 | 提问”切换和日期：系统按意图分发（ADR 0005），占位“记点什么，或问点什么……”。
- 用户消息：`bg-muted` 气泡，`rounded.bubble`，右对齐，下方 12px 元信息（怎么处理的）+ 低调的纠正文字按钮（改为提问 / 改为记录）。
- 无关消息的回应：一句正文，不套卡片，下方“记下来 / 帮我查”两个低调文字按钮。
- 拿不准时的反问：同样一句正文，写出具体问题，下方 1–3 个候选（“记下：…”“查：…”）做低调文字按钮；处理后候选消失，问题保留。
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
