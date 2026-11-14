---
name: Warm Accord
colors:
  surface: '#fff8f5'
  surface-dim: '#e1d8d3'
  surface-bright: '#fff8f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fbf2ed'
  surface-container: '#f5ece7'
  surface-container-high: '#f0e6e1'
  surface-container-highest: '#eae1dc'
  on-surface: '#1f1b18'
  on-surface-variant: '#59413d'
  inverse-surface: '#34302c'
  inverse-on-surface: '#f8efea'
  outline: '#8c716b'
  outline-variant: '#e0bfb9'
  surface-tint: '#ad321f'
  primary: '#a62e1b'
  on-primary: '#ffffff'
  primary-container: '#c84630'
  on-primary-container: '#fff7f6'
  inverse-primary: '#ffb4a6'
  secondary: '#366284'
  on-secondary: '#ffffff'
  secondary-container: '#abd6fd'
  on-secondary-container: '#315e7f'
  tertiary: '#675749'
  on-tertiary: '#ffffff'
  tertiary-container: '#816f60'
  on-tertiary-container: '#fff7f3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a6'
  on-primary-fixed: '#3f0300'
  on-primary-fixed-variant: '#8b1a09'
  secondary-fixed: '#cbe6ff'
  secondary-fixed-dim: '#a0cbf1'
  on-secondary-fixed: '#001e31'
  on-secondary-fixed-variant: '#1a4a6b'
  tertiary-fixed: '#f5decd'
  tertiary-fixed-dim: '#d8c3b2'
  on-tertiary-fixed: '#25190f'
  on-tertiary-fixed-variant: '#534437'
  background: '#fff8f5'
  on-background: '#1f1b18'
  surface-variant: '#eae1dc'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-amount-lg:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 34px
    letterSpacing: -0.03em
  label-amount-md:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.02em
  label-amount-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-caption:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

### Brand Personality & Aesthetic Ethos
The design system embodies modern Chinese etiquette—where interpersonal relationships, reciprocity, and traditional occasion culture meet the rigor of contemporary financial record-keeping. The tone is discreet, reverent, and quietly hospitable. It replaces cold ledger spreadsheets and vulgar crimson festive tropes with an understated editorial dignity rooted in warmth, tact, and clarity.

### Design Movement: Modern Oriental Tactility
The system harmonizes minimalism with subtle tactile textures:
- **Matte Rice-Paper Warmth:** Clean layout architectures draped in parchment-warm neutrals that prevent visual fatigue during lengthy reconciliation sessions.
- **Micro-tactile Precision:** Cards, chips, and ledger rows use fine hair-line borders, delicate layered surfaces, and gentle ambient shadows reminiscent of pressed Xuan paper and silk bookbinding.
- **Cultural Restraint:** Auspicious hues (vermilion, persimmon red) and solemn markers (indigo, graphite blue) serve as intentional communicative accents rather than saturated decorative washes.

## Colors

### Palette Intent & Psychological Mapping
- **Primary (朱柿赤 · Vermilion / #C84630):** Represents auspicious celebration, receipt of honor, and gracious acceptance. Applied to received gifts (收礼), affirmative confirmation points, and festive celebrations.
- **Secondary (青黛墨蓝 · Slate Indigo / #2D5A7B):** Represents commitment, solemnity, and outgoing goodwill. Applied to outgoing gifts (送礼/随礼), deliberate commitments, and outbound record metrics.
- **Tertiary (松烟香木 · Cedar Umber / #8C7A6B):** Bridges dual ledgers with a balanced third voice for neutral dates, archive statuses, and generational labels.
- **Neutral (玄墨黑 · Deep Ink Black / #24201D):** High-legibility typographic anchor modeled after dried Chinese ink stone; softer than pure `#000000` against warm paper backgrounds.

### Semantic Dual-Ledger Logic (Anti-Deficit Anxiety)
In traditional reciprocal balance sheets, financial deficits must never be framed as bankruptcy or shame:
- **Gift Received (入礼/贺礼):** Accent `#C84630` with surface tint `#FDF2F0` and border `#F7D2CD`.
- **Gift Extended (出礼/履诺):** Accent `#2D5A7B` with surface tint `#EBF2F7` and border `#C8DCED`.
- **Net Reciprocal Stance (对账差额):** 
  - When outbound exceeds inbound, style as *“厚谊在彼 / 待回礼”* using restrained indigo/slate tones.
  - When inbound exceeds outbound, style as *“承蒙厚爱 / 尚待履礼”* using soft warm sand and subtle persimmon badges. Never use harsh green/red stock-market indicators.
- **Solemn Occasions (白事/帛金):** Muted monochromatic slate gray (`#59636A`) with soft silver-ash fills (`#F3F4F6`), replacing celebratory vermilion entirely.

## Typography

### Structural Hierarchies
- **Typography Pairing:** Modern geometric clarity (`Plus Jakarta Sans`) seamlessly pairs with standard fallback system typography for CJK (PingFang SC, Hiragino Sans GB, Microsoft YaHei). It prioritizes rapid visual scanning of relationships and ledger line items.
- **Monospaced Numerical Precision:** Financial amounts, currency symbols, and tally figures strictly utilize tabular monospaced figures (`JetBrains Mono`). This guarantees baseline alignment across vertical balance columns and ledger summaries.
- **Kinship & Title Emphasis:** Relative and honorific titles (e.g., “表姑丈”, “堂兄”, “执友”) use medium weight with increased line-height to maintain cultural gravitas without overwhelming tabular layouts.

## Layout & Spacing

### Grid Architecture & Multi-device Strategy
The system adopts an asymmetric, adaptive multi-panel grid suited for complex two-way ledger balances:

- **Desktop (≥1200px):**
  - **Left Rail (260px fixed width):** Ledger selector, annual cycle filters, and category taxonomy.
  - **Main Canvas (Dual-column fluid layout):** 12-column grid with 24px gutters. Center-left split dedicated to "Received" (收礼明细) and center-right split dedicated to "Extended" (送礼对账).
  - **Detail Inspector / Slide-over Sheet (440px fixed width):** Contextual person-to-person historical reciprocity ledger and event logs.
- **Tablet (768px - 1199px):**
  - Collapsible side navigation to icon-rail (72px).
  - Tabular columns reflow into a toggleable dual-tab system or stacked reconciliation cards.
- **Mobile (<768px):**
  - Single-column continuous feed with sticky summary card pinned below top app bar.
  - Interactive bottom action bar with persistent Quick-Add floating drawer.
  - All complex filters collapse into a bottom sheet drawer with 16px lateral padding.

## Elevation & Depth

### Surface Architecture: Warm Paper Stratification
Depth is conveyed through tonal layering rather than heavy ambient blur or dramatic drop shadows.

- **Base Canvas (Level 0):** Warm Xuan-paper tone (`#FAF8F5`). Completely un-shadowed.
- **Container / Primary Cards (Level 1):** Solid white (`#FFFFFF`) with a 1px continuous hairline outline in `#EAE5DE`. Soft diffuse shadow: `0 2px 8px -2px rgba(36, 32, 29, 0.04)`.
- **Raised Interactive Cards & Popovers (Level 2):** `#FFFFFF` paired with an outline of `#DFD9D0`. Ambient elevation: `0 8px 24px -4px rgba(36, 32, 29, 0.07)`.
- **Overlays, Drawers & Modals (Level 3):** Modal backdrop uses a warm charcoal wash: `rgba(36, 32, 29, 0.45)` with a 4px backdrop blur. Modal body sits on `0 20px 40px -8px rgba(36, 32, 29, 0.12)`.
- **Divider Treatment:** Subtle hairline rules (`#EAE5DE`), never high-contrast black or cold steel gray.

## Shapes

### Contour & Corner Language
The shape language uses moderate organic curvature (`0.5rem` / `8px` base, scaling to `1rem` for cards and `1.5rem` for bottom sheets). This reflects the warmth of jade stones and traditional Chinese seal cuts, avoiding sterile sharp angles and playful hyper-rounded bubble forms.

- **Badges, Occasion Tags, and Chips:** Full pill (`9999px`) to emphasize seal-like stamps.
- **Ledger Cards & Data Modules:** `rounded-lg` (16px) for approachable density.
- **Drawers & Floating Modals:** `rounded-xl` (24px) on top edges to ground the upward glide on mobile viewports.

## Components

### 1. Ledger Balance Cards (对账平衡卡)
- **Structure:** Dual split module displaying incoming vs outgoing totals.
- **Inbound Block:** Subtle `#FDF2F0` background, vermilion header indicator, formatted total currency with receipt count.
- **Outbound Block:** Subtle `#EBF2F7` background, slate indigo header indicator, formatted total currency with obligation count.
- **Reciprocal Offset Status (人情往来净度):** Centered pill badge between blocks displaying contextual text (e.g., “往还平衡”, “承蒙关照 +¥2,000”, “待履礼节 ¥1,200”). Avoids stark math signs like `+` or `-` alone without courteous copy.

### 2. Occasion Category Chips (场景与礼俗标签)
- **Variants:**
  - *Wedding / Joyful (婚嫁喜事):* Vermilion text `#C84630`, tint `#FDF2F0`, subtle border `#F7D2CD`.
  - *Full Moon / Longevity (满月百岁):* Amber ochre text `#9E6316`, tint `#FDF8EE`, subtle border `#F1E3C8`.
  - *Funeral / Condolence (白事帛金):* Muted graphite slate text `#4A5560`, tint `#F2F4F5`, subtle border `#D8DEE4`.
- **Cultural Etiquette Warning Pill (忌讳轻提示):** When selecting Funeral/帛金, the amount input displays an automatic advisory pill: *“白事份子宜单数 (如 ¥501, ¥1001)，避双数”*.

### 3. Action Buttons & Micro-Interactions
- **Primary Action (收礼/主记账):** Solid vermilion fill (`#C84630`), white text, hover state `#B33B26`. Active micro-scale transition of `scale(0.98)`.
- **Secondary Action (随礼记账):** Solid slate indigo fill (`#2D5A7B`), white text, hover state `#234762`.
- **Tertiary / Neutral Action:** Warm linen fill (`#F5F1EB`), text `#544E48`, border `#EAE5DE`.

### 4. Input Fields & Amount Stepper
- **Currency Field:** JetBrains Mono font scaled to `28px` on active focus. Prefix `¥` in `#8C7A6B`.
- **Focus Rings:** Non-intrusive 2px outline in `#C84630` with a 20% opacity halo (`rgba(200, 70, 48, 0.15)`).
- **Kinship Picker (亲友关系联想输入):** Integrated auto-complete pill list (直系亲属, 姻亲, 同袍/同窗, 业友, 故旧) below the name input field.

### 5. Multi-Ledger Switcher (账本切换器)
- **Presentation:** Compact segmented selector or desktop dropdown.
- **Visuals:** Features seal icon mark, ledger name (e.g., “二零二四甲辰年家礼本”, “长女婚嫁专簿”), with date ranges and archived ledger badges.