# UI/UX Design System
## Hakawi - Visual Design and User Experience

---

## 1. Design Philosophy

### Core Identity

Hakawi is an Arabic storytelling platform inspired by Egyptian storytelling sessions, folk narratives, and human depth. The design balances **modern minimalism** with **warmth that encourages writing**.

### Design Principles

1. **Readability First** — Long-form reading is the primary use case; every design decision prioritizes reading comfort
2. **Warm Minimalism** — Clean layouts without coldness; warmth comes from color temperature and typography
3. **Optimistic Responsiveness** — UI responds immediately to user actions; server validation happens in the background
4. **Progressive Disclosure** — Show only what's needed; expand on demand
5. **Performance as Feature** — Skeleton screens, lazy loading, and smooth transitions are part of the UX, not afterthoughts

---

## 2. Typography System

### Arabic Typography

| Usage | Font | Rationale |
|-------|------|-----------|
| **Headings** | Amiri or Cairo | Elegant, traditional feel that honors the storytelling heritage |
| **Body Text** | IBM Plex Sans Arabic | Highly readable for long-form content; reduces eye strain |

### Latin Typography

| Usage | Font | Rationale |
|-------|------|-----------|
| **Headings** | Inter | Clean, modern, pairs well with Arabic headings |
| **Body Text** | Inter | Consistent with headings; excellent readability |

### Type Scale

```
text-xs: 0.75rem / 12px    - Labels, captions
text-sm: 0.875rem / 14px   - Secondary text, metadata
text-base: 1rem / 16px     - Body text (default)
text-lg: 1.125rem / 18px   - Lead paragraphs, story excerpts
text-xl: 1.25rem / 20px    - Card titles
text-2xl: 1.5rem / 24px    - Section headings
text-3xl: 1.875rem / 30px  - Page titles
text-4xl: 2.25rem / 36px   - Hero text
```

### Line Height and Measure

- **Body text line height:** 1.75 (generous for Arabic readability)
- **Max measure:** 65ch (characters) for optimal reading speed
- **Paragraph spacing:** 1.5em

---

## 3. Color System

### Dark Mode (Default)

**60-30-10 Rule:**

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Dominant (60%)** | Deep Obsidian Ink | `#0D0B0A` | Background, primary canvas |
| **Structural (30%)** | Warm Charcoal | `#1A1615` | Cards, borders, elevated surfaces |
| **Text Primary** | Muted Papyrus | `#EFECE6` | Primary text, headings |
| **Text Secondary** | Faded Papyrus | `#A8A49E` | Secondary text, metadata |
| **Accent Primary (10%)** | Glowing Amber | `#FF9100` | Likes, reactions, CTAs, highlights |
| **Accent Secondary (10%)** | Mystic Aqua | `#00E5FF` | Links, secondary buttons, hover states |
| **Border** | Warm Gray | `#2A2624` | Subtle borders, dividers |

**Color Psychology:**
- Deep Obsidian Ink: Inspired by ink and night of stories; warmer than pure black, reduces eye strain during extended reading
- Warm Charcoal: Creates depth hierarchy without harsh contrast
- Glowing Amber: Energy and warmth for social interactions; avoids cold blue "like" buttons
- Mystic Aqua: Modern tech feel for navigation and interactive elements

### Light Mode

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Dominant (60%)** | Soft Cream Book-page | `#FAF6EE` | Background, primary canvas |
| **Structural (30%)** | Warm White | `#FFFFFF` | Cards, elevated surfaces |
| **Text Primary** | Dark Sepia | `#2A2421` | Primary text, headings |
| **Text Secondary** | Medium Sepia | `#6B6560` | Secondary text, metadata |
| **Accent Primary (10%)** | Burnt Amber | `#E65100` | Likes, reactions, CTAs |
| **Accent Secondary (10%)** | Deep Aqua | `#00B8D4` | Links, secondary buttons |
| **Border** | Light Sepia | `#E8E4DE` | Subtle borders, dividers |

### Semantic Colors

| State | Color | Hex |
|-------|-------|-----|
| **Success** | Emerald | `#10B981` |
| **Warning** | Amber | `#F59E0B` |
| **Error** | Coral Red | `#EF4444` |
| **Info** | Sky Blue | `#3B82F6` |

### Color Usage Rules

- **Never use pure black (`#000000`) or pure white (`#FFFFFF`)** in dark mode
- **Always use Amber for social reactions** (like, love, clap) — never blue
- **Aqua is for navigation and UI chrome only** — not for content highlights
- **Text contrast ratio:** Minimum 4.5:1 for body text, 3:1 for large text (WCAG AA)

---

## 4. Spacing System

### Base Unit: 4px

```
space-1: 4px
space-2: 8px
space-3: 12px
space-4: 16px
space-5: 20px
space-6: 24px
space-8: 32px
space-10: 40px
space-12: 48px
space-16: 64px
```

### Component Spacing

| Component | Padding | Gap |
|-----------|---------|-----|
| **Button** | px-4 py-2 | - |
| **Card** | p-6 | gap-4 |
| **Story Card** | p-5 | gap-3 |
| **Form Input** | px-3 py-2 | - |
| **Feed Items** | - | space-y-6 |

---

## 5. Layout System

### Desktop Layout (1024px+)

```
┌─────────────────────────────────────────────────────────────┐
│ Header (sticky top-0, h-14)                                 │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │                   │
│  Right   │      Middle Column           │   Left Sidebar    │
│ Sidebar  │      (Feed)                  │   (Trending)      │
│          │      max-w-2xl               │                   │
│          │                              │                   │
│          │                              │                   │
└──────────┴──────────────────────────────┴───────────────────┘
```

**Column widths:**
- Right sidebar: 240px (fixed)
- Middle column: flexible, max-w-2xl (672px)
- Left sidebar: 280px (fixed)

### Tablet Layout (768px - 1023px)

```
┌──────────────────────────────────────────┐
│ Header (sticky top-0, h-14)              │
├──────────────────────────────────────────┤
│                                          │
│         Middle Column (Feed)             │
│         max-w-2xl, centered              │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

- Sidebars hidden
- Bottom navigation shown
- Feed centered with max-width

### Mobile Layout (< 768px)

```
┌──────────────────────┐
│ Header (h-14)        │
├──────────────────────┤
│                      │
│     Feed (full)      │
│                      │
│                      │
├──────────────────────┤
│ Bottom Navigation    │
└──────────────────────┘
```

- Full-width feed
- Bottom navigation with 4-5 icons
- No sidebars

---

## 6. Component Library

### Story Card

```
┌────────────────────────────────────────┐
│ [Cover Image]                          │
│                                        │
│ Title                                  │
│ Excerpt (4 lines max)                  │
│                                        │
│ Author Name  ·  Category  ·  Date      │
│                                        │
│ ❤ 42  💬 12  👁 1.2K                  │
└────────────────────────────────────────┘
```

**States:**
- **Default:** Subtle border, warm charcoal background
- **Hover:** Aqua/amber mixed glow shadow
- **Skeleton:** Animated placeholder with shimmer effect

### Story Creator Card

```
┌────────────────────────────────────────┐
│ ✍️ Write a story...              [+]  │
└────────────────────────────────────────┘

Expanded:
┌────────────────────────────────────────┐
│ [Rich Text Editor - Shadcn/TipTap]     │
│                                        │
│ [Tags: #رعب #واقعي #فلسفة]             │
│                                        │
│ [Publish Button]  [Save Draft]         │
└────────────────────────────────────────┘
```

### Reaction Button

```
Default:   ❤ 42
Hover:     ❤ 42 (amber glow)
Active:    ❤ 43 (amber filled, immediate count update)
```

**Optimistic update:** Count updates instantly on click, reverts on failure.

### Bottom Navigation (Mobile)

```
┌────┬────┬────┬────┐
│ 🏠 │ 📖 │ ❤ │ 👤 │
│Home│Feed│Fav │Profile│
└────┴────┴────┴────┘
```

---

## 7. UX Patterns

### Infinite Scroll Feed

**Implementation:**
- TanStack Query with `useInfiniteQuery`
- Load next page when user scrolls to 80% of current content
- Skeleton placeholders during load
- Glow effect on skeleton cards

**Performance:**
- Virtual scrolling for lists > 100 items
- Image lazy loading with blur placeholder
- Prefetch next page when user reaches 50%

### Optimistic Interactions

**Pattern:**
```typescript
// 1. Update UI immediately
setLikes(prev => prev + 1);

// 2. Send request in background
api.likeStory(storyId).catch(() => {
  // 3. Revert on failure
  setLikes(prev => prev - 1);
});
```

**Applied to:**
- Like/reaction buttons
- Follow/unfollow
- Bookmark
- Comment creation

### Skeleton Loading

**Pattern:**
- Show shimmer animation (amber to aqua gradient)
- Match exact card dimensions
- Disappear when data loads

**Implementation:**
```tsx
<div className="animate-pulse bg-warm-charcoal rounded-lg">
  <div className="h-48 bg-warm-charcoal/50 rounded-t-lg" />
  <div className="p-5 space-y-3">
    <div className="h-4 bg-warm-charcoal/50 rounded w-3/4" />
    <div className="h-3 bg-warm-charcoal/50 rounded w-full" />
    <div className="h-3 bg-warm-charcoal/50 rounded w-1/2" />
  </div>
</div>
```

---

## 8. Responsive Design

### Breakpoints

```
sm: 640px   - Large phones
md: 768px   - Tablets
lg: 1024px  - Small desktops
xl: 1280px  - Desktops
2xl: 1536px - Large desktops
```

### Responsive Rules

| Component | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| **Feed** | Full width | max-w-2xl, centered | max-w-2xl, centered |
| **Sidebars** | Hidden | Hidden | Visible |
| **Navigation** | Bottom bar | Bottom bar | Top navbar |
| **Story Card** | Full width | Full width | max-w-2xl |
| **Typography** | text-base | text-lg | text-lg |

---

## 9. Accessibility

### Requirements

- **Color contrast:** Minimum 4.5:1 for body text, 3:1 for large text
- **Focus indicators:** Visible on all interactive elements (2px amber outline)
- **Keyboard navigation:** Full keyboard support for all features
- **Screen reader:** ARIA labels on all interactive elements
- **Touch targets:** Minimum 44x44px for mobile
- **Motion preference:** Respect `prefers-reduced-motion`

### RTL Support

- **Mirror layout:** All horizontal layouts flip for Arabic
- **Text alignment:** Right-aligned for Arabic, left-aligned for English
- **Icons:** Mirror directional icons (arrows, chevrons)
- **Font fallback:** IBM Plex Sans Arabic for Arabic, Inter for Latin

---

## 10. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **First Contentful Paint** | < 1.5s | Lighthouse |
| **Largest Contentful Paint** | < 2.5s | Lighthouse |
| **Cumulative Layout Shift** | < 0.1 | Lighthouse |
| **First Input Delay** | < 100ms | Lighthouse |
| **Time to Interactive** | < 3.5s | Lighthouse |

### Optimization Strategies

- **Image optimization:** Next.js Image component with WebP/AVIF, lazy loading
- **Font optimization:** `font-display: swap`, subset Arabic characters
- **Code splitting:** Route-based splitting, dynamic imports for heavy components
- **Caching:** Static assets cached, API responses cached with TanStack Query
- **Bundle size:** Monitor with `@next/bundle-analyzer`, keep < 200KB initial load

---

## 11. Design Tokens

### Tailwind Configuration

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        'obsidian': '#0D0B0A',
        'charcoal': '#1A1615',
        'charcoal-light': '#2A2624',
        'papyrus': '#EFECE6',
        'papyrus-muted': '#A8A49E',
        'amber': '#FF9100',
        'amber-burnt': '#E65100',
        'aqua': '#00E5FF',
        'aqua-deep': '#00B8D4',
        'cream': '#FAF6EE',
        'sepia': '#2A2421',
        'sepia-medium': '#6B6560',
      },
      fontFamily: {
        'arabic-heading': ['Amiri', 'Cairo', 'serif'],
        'arabic-body': ['IBM Plex Sans Arabic', 'sans-serif'],
        'latin': ['Inter', 'sans-serif'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite',
        'skeleton': 'skeleton 1.5s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(0, 229, 255, 0.15)' },
          '50%': { boxShadow: '0 0 25px rgba(255, 145, 0, 0.2)' },
        },
        skeleton: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
};
```

---

## 12. Component Examples

### Story Card Component

```tsx
<div className="bg-charcoal rounded-lg p-5 border border-charcoal-light hover:border-aqua/30 transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,229,255,0.15)]">
  {coverImage && (
    <img src={coverImage} alt={title} className="w-full h-48 object-cover rounded-md mb-4" />
  )}
  <h3 className="text-xl font-arabic-heading text-papyrus mb-2">{title}</h3>
  <p className="text-papyrus-muted text-sm line-clamp-4 mb-4">{excerpt}</p>
  <div className="flex items-center justify-between text-sm text-papyrus-muted">
    <div className="flex items-center gap-2">
      <span>{authorName}</span>
      <span>·</span>
      <span>{category}</span>
    </div>
    <div className="flex items-center gap-4">
      <button className="flex items-center gap-1 hover:text-amber transition-colors">
        <Heart className="w-4 h-4" />
        <span>{likes}</span>
      </button>
      <button className="flex items-center gap-1 hover:text-aqua transition-colors">
        <MessageCircle className="w-4 h-4" />
        <span>{comments}</span>
      </button>
    </div>
  </div>
</div>
```

### Optimistic Like Button

```tsx
const [likes, setLikes] = useState(42);
const [isLiked, setIsLiked] = useState(false);

const handleLike = async () => {
  const previousLikes = likes;
  const previousIsLiked = isLiked;

  // Optimistic update
  setIsLiked(!isLiked);
  setLikes(prev => prev + (isLiked ? -1 : 1));

  try {
    await api.likeStory(storyId);
  } catch (error) {
    // Revert on failure
    setLikes(previousLikes);
    setIsLiked(previousIsLiked);
  }
};
```

---

## 13. Animation Guidelines

### Principles

1. **Purposeful:** Every animation serves a UX purpose (feedback, guidance, delight)
2. **Fast:** Animations complete in 150-300ms; never exceed 500ms
3. **Smooth:** 60fps target; use `transform` and `opacity` only
4. **Respect user preference:** Disable animations if `prefers-reduced-motion`

### Micro-interactions

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| **Button hover** | Scale 1.02 + glow | 150ms |
| **Card hover** | Shadow glow | 200ms |
| **Like button** | Scale bounce | 200ms |
| **Page transition** | Fade in + slide up | 300ms |
| **Modal open** | Fade in + scale | 200ms |
| **Skeleton load** | Shimmer | 1.5s infinite |

### Implementation

Use **Framer Motion** for complex animations, **Tailwind transitions** for simple state changes.

```tsx
// Page transition example
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  {children}
</motion.div>
```

---

## 14. Dark/Light Mode

### Default: Dark Mode

Users prefer dark mode for extended reading. Light mode is available as an option.

### Toggle Location

- Header: Sun/Moon icon button
- Persist preference in localStorage
- Respect system preference on first visit

### Implementation

```tsx
const [theme, setTheme] = useState<'dark' | 'light'>('dark');

useEffect(() => {
  const stored = localStorage.getItem('theme') as 'dark' | 'light';
  if (stored) {
    setTheme(stored);
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    setTheme('light');
  }
}, []);
```

---

## 15. RTL (Right-to-Left) Support

### Language Toggle

- Arabic (default) and English
- Toggle in header
- Persist preference in localStorage

### RTL Adaptations

| Element | Arabic (RTL) | English (LTR) |
|---------|--------------|---------------|
| **Text alignment** | Right | Left |
| **Layout** | Mirrored | Normal |
| **Icons** | Mirrored (arrows, chevrons) | Normal |
| **Navigation** | Right sidebar | Left sidebar |
| **Dates** | Arabic format | English format |

### Implementation

Use `dir` attribute on `<html>` element:
```tsx
<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
```

Tailwind logical properties:
- `ms-` instead of `ml-`
- `me-` instead of `mr-`
- `ps-` instead of `pl-`
- `pe-` instead of `pr-`

---

## 16. Design Tokens Summary

| Token | Dark Mode | Light Mode |
|-------|-----------|------------|
| **Background** | `#0D0B0A` | `#FAF6EE` |
| **Surface** | `#1A1615` | `#FFFFFF` |
| **Border** | `#2A2624` | `#E8E4DE` |
| **Text Primary** | `#EFECE6` | `#2A2421` |
| **Text Secondary** | `#A8A49E` | `#6B6560` |
| **Accent Primary** | `#FF9100` | `#E65100` |
| **Accent Secondary** | `#00E5FF` | `#00B8D4` |
| **Success** | `#10B981` | `#10B981` |
| **Warning** | `#F59E0B` | `#F59E0B` |
| **Error** | `#EF4444` | `#EF4444` |

---

*This document defines the UI/UX design system for Hakawi.*
