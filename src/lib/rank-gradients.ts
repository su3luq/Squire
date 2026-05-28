// Preset gradient palette for rank rings. Admins pick one of these
// by ID when editing the rank ladder; we render the gradient via
// inline style so admins can't accidentally break Tailwind classes
// in the DB. Adding a new gradient is a one-line addition here +
// nothing on the DB side (the DB just stores the ID string).

export type RankGradient = {
  id: string;
  label: string;
  // CSS `background` value, typically a `linear-gradient(...)`.
  gradient: string;
  // Optional CSS `box-shadow` color for a glow halo. When present,
  // the ring renders with a soft glow.
  glow?: string;
};

export const RANK_GRADIENTS: readonly RankGradient[] = [
  // Apex / legendary tiers — strong glows.
  {
    id: 'mythic',
    label: 'Mythic',
    gradient:
      'linear-gradient(135deg, #f0abfc 0%, #a78bfa 50%, #fde047 100%)',
    glow: 'rgba(216,180,254,0.70)',
  },
  {
    id: 'sapphire',
    label: 'Sapphire',
    gradient:
      'linear-gradient(135deg, #67e8f9 0%, #3b82f6 50%, #4338ca 100%)',
    glow: 'rgba(59,130,246,0.55)',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    gradient:
      'linear-gradient(135deg, #6ee7b7 0%, #2dd4bf 50%, #047857 100%)',
    glow: 'rgba(16,185,129,0.45)',
  },
  {
    id: 'ruby',
    label: 'Ruby',
    gradient:
      'linear-gradient(135deg, #fda4af 0%, #ef4444 50%, #7f1d1d 100%)',
    glow: 'rgba(239,68,68,0.50)',
  },
  {
    id: 'amethyst',
    label: 'Amethyst',
    gradient:
      'linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 50%, #4c1d95 100%)',
    glow: 'rgba(139,92,246,0.45)',
  },

  // Mid tiers — no glow, rich colors.
  {
    id: 'gold',
    label: 'Gold',
    gradient:
      'linear-gradient(135deg, #fde047 0%, #f59e0b 50%, #ea580c 100%)',
  },
  {
    id: 'rose',
    label: 'Rose',
    gradient:
      'linear-gradient(135deg, #fda4af 0%, #ec4899 50%, #831843 100%)',
  },
  {
    id: 'jade',
    label: 'Jade',
    gradient:
      'linear-gradient(135deg, #a7f3d0 0%, #10b981 50%, #064e3b 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    gradient:
      'linear-gradient(135deg, #a5f3fc 0%, #06b6d4 50%, #155e75 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    gradient:
      'linear-gradient(135deg, #fed7aa 0%, #f97316 50%, #c2410c 100%)',
  },

  // Lower tiers — muted metallics.
  {
    id: 'silver',
    label: 'Silver',
    gradient:
      'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 50%, #64748b 100%)',
  },
  {
    id: 'bronze',
    label: 'Bronze',
    gradient:
      'linear-gradient(135deg, #d97706 0%, #c2410c 50%, #9f1239 100%)',
  },
  {
    id: 'stone',
    label: 'Stone',
    gradient:
      'linear-gradient(135deg, #94a3b8 0%, #64748b 50%, #334155 100%)',
  },
  {
    id: 'obsidian',
    label: 'Obsidian',
    gradient:
      'linear-gradient(135deg, #475569 0%, #1e293b 50%, #0f172a 100%)',
  },
  {
    id: 'sand',
    label: 'Sand',
    gradient:
      'linear-gradient(135deg, #fde68a 0%, #d4a574 50%, #78350f 100%)',
  },
];

export const RANK_GRADIENT_BY_ID: Readonly<Record<string, RankGradient>> =
  Object.freeze(
    Object.fromEntries(RANK_GRADIENTS.map((g) => [g.id, g])),
  );

export function resolveGradient(id: string | null | undefined): RankGradient | null {
  if (!id) return null;
  return RANK_GRADIENT_BY_ID[id] ?? null;
}
