# Production Dashboard - Requirements Breakdown

## Product Overview

- **Product Type**: Data Dashboard / Production Monitoring Panel
- **Scene Type**: <scene_type>prototype-dashboard</scene_type>
- **Target Users**: Garment factory production managers, department supervisors, operations analysts
- **Core Value**: Provide a centralized, real-time view of garment factory production performance across all departments (CUT, SEW, EMB, PRN, FIN, QC, PAK), enabling quick identification of bottlenecks, overtime trends, and plan-vs-actual deviations.
- **Interface Language**: English (UI labels in English per the hand-drawn reference; user prompt is in Vietnamese but all dashboard content/labels are English)
- **Theme Preference**: Light (navy/blue/teal accents on light background, as explicitly requested)
- **Navigation Mode**: Dashboard Header only (no Sidebar/Topbar)
- **Reference Attachment**: User provided 1 hand-drawn sketch image (attachment_id=12e9a679-e1c7-4e24-a10a-c8199d4ad902, image.png) showing the exact layout: Header → 4 KPI cards → Department filter buttons → 2 charts side-by-side → Department Daily Summary table. The design MUST faithfully follow this layout.

---

## Page Structure

> **Note**: Dashboard is a single-page scenario. Below describes the page block structure.

**Page File**: `DashboardPage.tsx`

| Block Name | Block Description |
|-----------|------------------|
| Header | Dashboard title "Production Overview", subtitle "Garment Factory • Production Monitoring", time range filter dropdown (default "Last 3 Months"), notification bell icon, user info area (avatar + name "Nguyen Thi A" + role "Production Manager") |
| KPI Cards Row | 4 KPI cards in a single row: Sewing Output (pcs), Total OT (hours), Actual OT (hours), IGM OT. Each card has: icon, title, main metric value, unit, trend percentage with arrow, mini sparkline chart, "vs. last 3 months" label |
| Department Filter Bar | Horizontal button group: All Departments (default active), CUT, SEW, EMB, PRN, FIN, QC, PAK. Each button has an icon. Active button has highlighted/filled state. Label "Production Departments:" on the left |
| Charts Row (2-column) | Left: "Monthly Plan vs Actual" grouped bar chart. Right: "Department Output Trend" multi-line chart. Both charts share the same time axis (Month 8, Month 9, Month 10) |
| Department Daily Summary Table | Full-width data table below charts with columns: Date, Department, Process, Workers, Plan (pcs), Plan Completion Date, Actual Time, Actual/Scan Time, Status. Status uses colored badges (green "On Track", orange/yellow "Delay"). Table has pagination or scroll for many records |

---

## Data Analysis

### Data File Overview
- **File**: No external data file provided. User explicitly states: "Không tự tạo số liệu sản xuất thật. Nếu chưa có API, hãy dùng dữ liệu mẫu và ghi rõ đây là dữ liệu minh họa." (Do not create real production data. If no API, use sample data and clearly mark it as illustrative.)
- **Data Source**: Demo mock data structured to match the hand-drawn sketch exactly
- **Time Range**: 3 months (Month 8 = August 2025, Month 9 = September 2025, Month 10 = October 2025, based on current date 2026-10-10 context but using the sketch's month labels)
- **Dimensions**: Department (CUT, SEW, EMB, PRN, FIN, QC, PAK), Month, Process, Date
- **Metrics**: Sewing Output (pcs), Total OT (hours), Actual OT (hours), IGM OT, Plan (pcs), Actual (pcs), Workers count, Actual Time, Scan Time

### KPI Metrics Planning

| Metric Name | Calculation | Data Fields | Sample Value (from sketch) |
|------------|-------------|-------------|---------------------------|
| Sewing Output | Sum of sewing department output over period | `sewingOutput` | 482,360 pcs, ↑12.5% |
| Total OT (Plan) | Sum of planned overtime hours across all departments | `totalOTPlan` | 3,240 hours, ↑8.7% |
| Actual OT | Sum of actual overtime hours across all departments | `actualOT` | 2,865 hours, ↑10.2% |
| IGM OT | Sum of IGM (In-Garment-Marking) overtime hours | `igmOT` | 1,320, ↑6.8% |

### Chart Planning

| Chart Name | Chart Type | Fields Used | Analysis Purpose |
|-----------|-----------|-------------|-----------------|
| Monthly Plan vs Actual | Grouped Bar Chart (2 bars per month: Plan + Actual) with optional trend line | `month`, `planOutput`, `actualOutput` | Compare planned vs actual production output month-over-month; identify gaps and growth trends |
| Department Output Trend | Multi-Line Chart (7 lines, one per department) | `month`, `department`, `output` | Track each department's production trend over time; identify which departments are growing/declining; respond to department filter |

### Table Data Structure

| Column | Field | Format | Example |
|--------|-------|--------|---------|
| Date | `date` | YYYY-MM-DD | 2025-07-28 |
| Department | `department` | Enum: CUT/SEW/EMB/PRN/FIN/QC/PAK | CUT |
| Process | `process` | String | Cutting |
| Workers | `workers` | Integer | 12 |
| Plan (pcs) | `planPcs` | Integer with comma formatting | 8,000 |
| Plan Completion Date | `planCompletionDate` | YYYY-MM-DD | 2025-07-28 |
| Actual Time | `actualTime` | Xh Ym format | 7h 45m |
| Actual / Scan Time | `scanTime` | Xh Ym format | 7h 50m |
| Status | `status` | Enum: "On Track" / "Delay" | On Track (green badge) / Delay (orange badge) |

---

## Data Source Declaration

| Data/Operation | Source Type | Implementation Requirement | Mock Fallback |
|---|---|---|---|
| KPI card metrics (Sewing Output, Total OT, Actual OT, IGM OT) | demo-mock | `src/data/kpiData.ts` const array with 4 KPI objects containing value, unit, trend%, sparkline data points | ✅ This IS the mock — user explicitly requested sample data |
| Monthly Plan vs Actual chart data | demo-mock | `src/data/monthlyData.ts` const array with 3 months × {plan, actual} values matching sketch (120k/135k, 145k/160k, 160k/182k) | ✅ This IS the mock |
| Department Output Trend chart data | demo-mock | `src/data/departmentTrendData.ts` const array with 7 departments × 3 months output values matching sketch proportions | ✅ This IS the mock |
| Department Daily Summary table data | demo-mock | `src/data/dailySummaryData.ts` const array with ~21 rows (7 departments × 3 days minimum), fields matching table columns, status computed by rule: if scanTime > actualTime threshold → "Delay", else → "On Track" | ✅ This IS the mock |
| Department filter state | local-state | React `useState` for selected department, default "all". Filters chart data and table data client-side via `.filter()` | N/A (UI state only) |
| Time range filter | local-state | React `useState` for selected time range, default "last3Months". Dropdown with options: Last 3 Months, Last 6 Months, Last 12 Months | N/A (UI state only, filters mock data by month range) |
| Sparkline data in KPI cards | demo-mock | Embedded in KPI data objects as small number arrays (e.g., 6-8 data points) for mini line chart rendering | ✅ Part of KPI mock |

> **Self-check for demo-mock declaration**: 
> 1. Input contains free text/images/audio? → No, pure structured numeric data
> 2. Needs semantic judgment/classification? → No, simple numeric aggregation
> 3. Needs natural language generation? → No
> 4. User said "smart/AI/auto"? → No
> → All 4 checks pass, `demo-mock` is correct. User explicitly requested sample/illustrative data.

---

## AI Insight Directions

- **Insight 1**: `[Plan-Actual Gap Analysis] | [Month 8 gap: 15k pcs (12.5%), Month 9 gap: 15k pcs (10.3%), Month 10 gap: 22k pcs (13.8%)] | [Gap is widening in Month 10 — investigate root cause in SEW and CUT departments which show largest deviations]`
- **Insight 2**: `[Department Growth Ranking] | [SEW output grew from ~48k to ~68k (+41.7%), CUT from ~35k to ~52k (+48.6%), while QC grew only from ~8k to ~12k (+50% but lowest absolute)] | [SEW and CUT are primary growth drivers; ensure QC capacity scales proportionally to avoid bottleneck]`
- **Insight 3**: `[Overtime Efficiency] | [Total OT Plan: 3,240h vs Actual OT: 2,865h — actual is 11.6% below plan, suggesting efficient execution] | [Monitor IGM OT (1,320) as proportion of total — if IGM OT ratio increases, it may indicate upstream process delays feeding into marking stage]`

---

## Function List

- **Dashboard Overall Functions**:
  - **Page Goal**: Provide production managers a single-screen overview of garment factory performance with drill-down by department
  - **Function Points**:
    - **KPI Metric Display**: Render 4 KPI cards with main value, unit, trend arrow + percentage, mini sparkline chart, and "vs. last 3 months" comparison label. Values sourced from mock data constants.
    - **Department Filter Interaction**: Clicking a department button updates `selectedDepartment` state. Active button renders with filled navy/blue background. All Departments resets filter. Filtered state propagates to both charts (Department Output Trend shows only selected department's line; Monthly Plan vs Actual aggregates only selected department) and table (shows only matching rows).
    - **Monthly Plan vs Actual Chart**: Grouped bar chart using Recharts `BarChart` with two `Bar` components (Plan in teal/green, Actual in navy/dark blue). X-axis: Month 8/9/10. Y-axis: output in pcs with comma formatting. Legend below chart. Tooltip on hover showing exact values. Optional trend line overlay.
    - **Department Output Trend Chart**: Multi-line chart using Recharts `LineChart` with 7 `Line` components, each department assigned a distinct color (CUT=blue, SEW=green, EMB=orange, PRN=purple, FIN=red, QC=cyan, PAK=violet). X-axis: Month 8/9/10. Y-axis: output in pcs. Legend on right side. Tooltip on hover. When department filter is active, only show that department's line (or highlight it and dim others).
    - **Department Daily Summary Table**: Render data table with 9 columns. Status column uses colored badges: green background + "On Track" text, orange/amber background + "Delay" text. Table header row has subtle background. Rows have alternating or bordered separation. Pagination controls at bottom (e.g., 10 rows per page) or vertical scroll with sticky header. Numbers formatted with commas, times in "Xh Ym" format, dates in YYYY-MM-DD.
    - **Time Range Filter**: Dropdown in header defaulting to "Last 3 Months". Options: Last 3 Months, Last 6 Months, Last 12 Months. Changing selection filters all mock data by corresponding month range (for demo, only 3 months of data exist, so 6M/12M show same data with a note).

---

## Design Specifications

### Color Palette
- **Primary Navy**: `#1e3a5f` or similar deep navy for headers, active states, Actual bars
- **Blue**: `#2563eb` or similar for accents, links, CUT department line
- **Teal/Green**: `#0d9488` or `#14b8a6` for Plan bars, positive trends, SEW department line
- **Background**: `#f8fafc` or `#f1f5f9` light gray
- **Card Background**: `#ffffff` white with subtle border `#e2e8f0` and shadow `0 1px 3px rgba(0,0,0,0.1)`
- **Status Green**: `#dcfce7` background + `#166534` text for "On Track"
- **Status Orange**: `#fef3c7` background + `#92400e` text for "Delay"
- **Department Colors**: CUT=`#3b82f6`, SEW=`#10b981`, EMB=`#f59e0b`, PRN=`#8b5cf6`, FIN=`#ef4444`, QC=`#06b6d4`, PAK=`#a855f7`

### Typography
- **Font**: System font stack or Inter/Poppins for clean readability
- **KPI Value**: 28-32px bold
- **KPI Title**: 14px medium, gray-600
- **Section Titles**: 16-18px semibold
- **Table Text**: 13-14px regular
- **Consistent spacing**: 16px/24px padding in cards, 8px gaps between elements

### Card Styling
- Border radius: 8-12px (`rounded-lg` or `rounded-xl`)
- Border: 1px solid `#e2e8f0`
- Shadow: subtle (`shadow-sm`)
- Padding: 20-24px

### Responsive Behavior
- **Desktop (≥1280px)**: Full layout as designed — 4 KPI cards in 1 row, 2 charts side-by-side (50/50), full-width table
- **Tablet (768-1279px)**: KPI cards 2×2 grid, charts stack vertically, table horizontal scroll
- **Mobile (<768px)**: KPI cards 1 column, charts stack, table horizontal scroll with sticky first column

### Layout Reference (from hand-drawn sketch)
```
┌─────────────────────────────────────────────────────────┐
│ 🏭 Production Overview          [Last 3 Months ▼] 🔔 👤 │
│    Garment Factory • Production Monitoring               │
├──────────┬──────────┬──────────┬──────────────────────────┤
│ Sewing   │ Total OT │ Actual OT│ IGM OT                   │
│ 482,360  │ 3,240    │ 2,865    │ 1,320                    │
│ ↑12.5%   │ ↑8.7%    │ ↑10.2%   │ ↑6.8%                    │
│ ~spark~  │ ~spark~  │ ~spark~  │ ~spark~                  │
├──────────┴──────────┴──────────┴──────────────────────────┤
│ Production Departments: [All] [CUT] [SEW] [EMB] [PRN]... │
├────────────────────────────┬─────────────────────────────┤
│ Monthly Plan vs Actual     │ Department Output Trend      │
│ ████ ████  ████ ████       │ ╱╲  ╱╲  ╱╲  (7 lines)      │
│ Plan  Actual               │ CUT SEW EMB PRN FIN QC PAK  │
├────────────────────────────┴─────────────────────────────┤
│ 📋 Department Daily Summary                               │
│ Date | Dept | Process | Workers | Plan | ... | Status    │
│ 2025-07-28 | CUT | Cutting | 12 | 8,000 | ... | On Track│
│ ...                                                       │
└─────────────────────────────────────────────────────────┘

-------

<scene_type>prototype-app</scene_type>

# UI 设计指南

## 1. 设计推导依据

- **参考意图**: Structural Reference —— The hand-drawn sketch provides the information architecture (Header → KPIs → Filters → Charts → Table), while the visual language is derived from the user's explicit request for a "professional, modern" garment factory dashboard with navy/teal tones.
- **核心情绪 / 应用类型**: Operational clarity and industrial precision for a high-volume manufacturing environment (Dashboard / Data Monitoring).
- **独特记忆点**: A "Cool Industrial" palette where deep Navy represents planned targets and vibrant Teal represents actual output, creating a clear visual dialectic between expectation and reality across all charts and cards.

## 2. Art Direction

- **方向名**: Swiss Industrial Minimal
- **Design Style**: Swiss Minimalist + Material Order —— High information density requires a rigid grid and clear typographic hierarchy to prevent cognitive overload in a production setting.
- **DNA 参数**: `rounded-lg` (subtle softness for cards) / `shadow-sm` (lifted but grounded) / `gap-6` (standard breathing room) / Sans-serif geometric / Functional iconography only.
- **应用类型**: Dashboard —— Fixed sidebar or top-nav (implied), content-focused scrolling, desktop-first data density.

## 3. Color System

**色彩关系**: Deep Navy (Authority/Plan) + Vibrant Teal (Action/Actual) + Cool Slate (Structure) on a Cloud White canvas.
**配色设计理由**: Navy anchors the interface as the "source of truth" (Plan data), while Teal provides immediate feedback on "live" performance (Actual data). This dual-tone system allows users to instantly distinguish status in bar charts without reading legends.
**主色推导**: Primary is Deep Navy (`hsl(222 47% 11%)`) to convey corporate stability; Accent is Teal (`hsl(172 66% 50%)`) to highlight growth and actuals.
**使用比例**: 60% Neutral (White/Slate) / 30% Secondary (Navy text/borders) / 10% Primary (Teal highlights/CTAs).

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|---|---|---|---|---|
| bg | `--background` | `bg-background` | hsl(210 20% 98%) | Very light cool gray, reduces eye strain vs pure white |
| card | `--card` | `bg-card` | hsl(0 0% 100%) | Pure white for maximum contrast against bg |
| text | `--foreground` | `text-foreground` | hsl(222 47% 11%) | Deep navy-black for headings and primary data |
| textMuted | `--muted-foreground` | `text-muted-foreground` | hsl(215 16% 47%) | Slate gray for labels, axis text, and metadata |
| primary | `--primary` | `bg-primary` | hsl(222 47% 11%) | Deep Navy: Used for "Plan" bars, active states, main text |
| primaryForeground | `--primary-foreground` | `text-primary-foreground` | hsl(0 0% 100%) | White text on navy buttons |
| accent | `--accent` | `bg-accent` | hsl(172 66% 50%) | Vibrant Teal: Used for "Actual" bars, positive trends, CTAs |
| accentForeground | `--accent-foreground` | `text-accent-foreground` | hsl(175 84% 10%) | Dark teal for text on light teal backgrounds |
| border | `--border` | `border-border` | hsl(214 32% 91%) | Subtle cool gray for table lines and card borders |

**语义色提示**:
- **Success (On Track)**: `hsl(142 76% 36%)` (Emerald) — bg: `hsl(142 76% 95%)`, border: `hsl(142 76% 85%)`, text: `hsl(142 76% 25%)`. Aligned with Teal accent but darker/greener.
- **Warning (Delay)**: `hsl(38 92% 50%)` (Amber) — bg: `hsl(38 92% 95%)`, border: `hsl(38 92% 85%)`, text: `hsl(38 92% 30%)`. Warm contrast to the cool UI.
- **Error**: `hsl(0 84% 60%)` (Red) — bg: `hsl(0 84% 95%)`, border: `hsl(0 84% 85%)`, text: `hsl(0 84% 40%)`.

## 4. 字体与节奏

- **font-display**: `Inter` —— Clean, highly legible at small sizes, standard for enterprise dashboards.
- **font-body**: `Inter` —— Unified type system for data consistency.
- **字号**: H1 `text-2xl font-bold`; KPI Value `text-3xl font-semibold tabular-nums`; Body `text-sm`; Table `text-xs/sm`.
- **圆角**: `rounded-lg` (8px) for cards and inputs; `rounded-full` for status pills and filter chips.

## 5. 全局布局契约

- **Reference Layout Use**: Follows the sketch's vertical stack: Header → KPI Row (4 cols) → Filter Row → Chart Row (2 cols) → Table Section.
- **Page / Section Order**: Strict adherence to the provided wireframe structure.
- **Standard Content Zone**: `max-w-[1400px] mx-auto px-6 py-8`. Wide enough for 4 KPI cards and 2 complex charts without cramping.
- **Shell / Frame Alignment**: Content container aligns with the header padding; no independent sidebar chrome specified, assuming a top-heavy or full-width app shell.
- **Padding & Rhythm**: `gap-6` between major sections; `gap-4` within card grids. Vertical rhythm based on 8px grid.
- **Full-bleed Zones**: None; all content contained within the max-width wrapper for focus.
- **Local Narrowing**: Table section spans full content width; filters align left.
- **Overflow Strategy**: Table uses `overflow-x-auto` with sticky first column (Date) if needed; Charts use responsive containers.
- **Flexibility Boundary**: KPI grid collapses to 2x2 on tablet, 1x4 on mobile. Chart row stacks vertically on tablet.

## 6. 视觉与动效

- **装饰**: Minimal. Use subtle background patterns or gradients only in empty states. Focus on data ink ratio.
- **阴影/边界**: `shadow-sm` for cards to lift them off the `bg-background`; `border` for table rows to define structure without heaviness.
- **动效**: Restrained. Hover states on table rows (`bg-accent/5`); smooth transitions on filter chip selection (`transition-colors duration-200`); chart tooltips fade in.

## 7. 组件原则

- **KPI Cards**: Must include a sparkline or trend indicator (arrow + percentage) in the `accent` or `success` color. Icon container uses a soft tint of the primary/accent.
- **Filter Chips**: "All Departments" is the active state (Primary bg, White text). Inactive chips are Outline style (Border + Text Muted). Hover state uses Accent bg tint.
- **Charts**:
    - *Bar Chart*: Grouped bars. Plan = `primary` (Navy), Actual = `accent` (Teal). Grid lines should be `border` color, dashed.
    - *Line Chart*: Multi-series. Use a categorical palette derived from the base hues (Navy, Teal, Slate, Amber, etc.) ensuring distinctiveness.
- **Table**: Header row `bg-muted/50` with `text-muted-foreground uppercase text-xs`. Status badges use the semantic color system (bg/border/text triad).

## 8. Image Direction

- **Image Role**: No photographic images required. Visual interest comes from data visualization and iconography.
- **Image Art Direction**: N/A.
- **Image Prompt Keywords**: N/A.
- **Image Avoidance**: Avoid generic "business people shaking hands" stock photos or abstract 3D shapes that distract from the data.

## 9. Anti-patterns

- **Neon Overload**: Do not use high-saturation neon colors for the whole UI; restrict vibrancy to the Teal accent and status indicators.
- **Grid Chaos**: Do not let charts overflow their containers or misalign with the KPI grid above.
- **Status Ambiguity**: Never rely on color alone for status (e.g., "Delay"); always include text labels or icons within the badge.
- **Default Styling**: Avoid default browser scrollbars or unstyled table borders; everything must feel like a cohesive "Germton Group" product.