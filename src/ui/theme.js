export const UI_FONTS = {
  display: '"Palatino Linotype", "Book Antiqua", "Times New Roman", serif',
  heading: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
  body: '"Segoe UI", "Trebuchet MS", Verdana, sans-serif',
  compact: '"Segoe UI Semibold", "Trebuchet MS", Verdana, sans-serif',
};

export const HUD_THEME = {
  semanticColors: {
    textStrong: "#261b10",
    textMuted: "#5d4b34",
    textInfo: "#2f5f90",
    textPositive: "#2f7242",
    textWarning: "#8b3828",
    panelBg: 0xefe2c8,
    panelBorder: 0x6f5330,
    panelActiveBg: 0xf5ecd8,
    panelSoftBg: 0xe6d7bd,
    panelElevatedBg: 0xf1e6d2,
    panelDarkBg: 0x2c251b,
    panelSunkenBg: 0xd9c8aa,
    accentBlue: 0x2f5f90,
    accentGreen: 0x3e6d58,
    accentAmber: 0x8b5a2e,
    accentRed: 0x8a4734,
    minimapFog: 0x3f3c37,
  },
  buttonStrokeWidth: 2,
  buttonHoverScale: 1.012,
  buttonPressScale: 0.965,
  panelStrokeWidth: 2,
};

export const UI_BUTTON_VARIANTS = {
  primary: {
    enabledFill: 0x315f92,
    hoverFill: 0x3f75ab,
    activeFill: 0x274f7c,
    warningFill: 0x8b5a2e,
    disabledFill: 0x667083,
    stroke: 0xe6d7b9,
    textColor: "#f8f1dd",
    enabledAlpha: 0.97,
    hoverAlpha: 1,
    activeAlpha: 0.99,
    warningAlpha: 0.98,
    disabledAlpha: 0.84,
  },
  secondary: {
    enabledFill: 0x655b47,
    hoverFill: 0x776a55,
    activeFill: 0x524a3a,
    warningFill: 0x8b5a2e,
    disabledFill: 0x716d63,
    stroke: 0xddd0b3,
    textColor: "#f4ead4",
    enabledAlpha: 0.96,
    hoverAlpha: 0.99,
    activeAlpha: 0.98,
    warningAlpha: 0.98,
    disabledAlpha: 0.84,
  },
  success: {
    enabledFill: 0x3e6d58,
    hoverFill: 0x4d846c,
    activeFill: 0x325948,
    warningFill: 0x8b5a2e,
    disabledFill: 0x6b766f,
    stroke: 0xe2d6b9,
    textColor: "#f1ebd8",
    enabledAlpha: 0.97,
    hoverAlpha: 1,
    activeAlpha: 0.99,
    warningAlpha: 0.98,
    disabledAlpha: 0.84,
  },
  warning: {
    enabledFill: 0x8a5b2f,
    hoverFill: 0xa06b3a,
    activeFill: 0x744b26,
    warningFill: 0x8a5b2f,
    disabledFill: 0x7f7568,
    stroke: 0xe6d7b9,
    textColor: "#fff5e2",
    enabledAlpha: 0.97,
    hoverAlpha: 1,
    activeAlpha: 0.99,
    warningAlpha: 0.98,
    disabledAlpha: 0.84,
  },
  danger: {
    enabledFill: 0x7e4529,
    hoverFill: 0x96563a,
    activeFill: 0x6a3720,
    warningFill: 0x8a5b2f,
    disabledFill: 0x7f7568,
    stroke: 0xe6d7b9,
    textColor: "#fdf0df",
    enabledAlpha: 0.97,
    hoverAlpha: 1,
    activeAlpha: 0.99,
    warningAlpha: 0.98,
    disabledAlpha: 0.84,
  },
  chip: {
    enabledFill: 0x62635f,
    hoverFill: 0x767873,
    activeFill: 0x315f92,
    warningFill: 0x8a5b2f,
    disabledFill: 0x72746f,
    stroke: 0xe4d8c0,
    textColor: "#f1ead9",
    enabledAlpha: 0.95,
    hoverAlpha: 0.98,
    activeAlpha: 0.99,
    warningAlpha: 0.98,
    disabledAlpha: 0.84,
  },
};

export const STARTUP_THEME = {
  panelFill: 0x111926,
  panelAlpha: 0.75,
  panelStroke: 0xdfc58f,
  panelStrokeAlpha: 0.65,
  titleColor: "#f4e4bf",
  subtitleColor: "#c8d7ea",
  hintColor: "#d2c4a2",
  bodyColor: "#dce7f6",
};

export const STARTUP_BUTTON_VARIANTS = {
  primary: {
    baseFill: 0x386b56,
    hoverFill: 0x46846b,
    downFill: 0x2e5948,
    stroke: 0xe6d6b5,
    textColor: "#f8f1df",
  },
  secondary: {
    baseFill: 0x775736,
    hoverFill: 0x916b43,
    downFill: 0x62482d,
    stroke: 0xe6d6b5,
    textColor: "#f8f1df",
  },
  neutral: {
    baseFill: 0x5f594c,
    hoverFill: 0x736b5b,
    downFill: 0x4f493e,
    stroke: 0xe0d2b3,
    textColor: "#f3ead6",
  },
};

export function resolveButtonPalette(variant = "primary", overrides = {}) {
  const base = UI_BUTTON_VARIANTS[variant] ?? UI_BUTTON_VARIANTS.primary;
  return { ...base, ...overrides };
}

export function resolveStartupButtonPalette(variant = "primary", overrides = {}) {
  const base = STARTUP_BUTTON_VARIANTS[variant] ?? STARTUP_BUTTON_VARIANTS.primary;
  return { ...base, ...overrides };
}
