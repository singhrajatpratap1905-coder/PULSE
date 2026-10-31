// Geometry shared by the main process (window size) and the renderer (morph targets).

export const NOTCH = { width: 184, height: 30, radius: 14 }
export const PANEL = { width: 760, height: 430, radius: 24 }

// The collapsed notch widens to this while showing an activity.
export const ACTIVITY = { width: 340, height: 38, radius: 18 }

// Boo's tiny home: the idle notch when "Boo lives in the notch" is on. Kept small so it
// doesn't cover tabs or title bars.
export const TINY = { width: 88, height: 38, radius: 19 }

// Taller, for activities where Boo the mascot acts out a scene.
export const SCENE = { width: 410, height: 64, radius: 26 }

// Size of the outward-curving "ears" where the notch meets the top edge.
export const EAR = 14

// Transparent room around the panel so its drop shadow is not clipped.
export const SHADOW_PAD = 36

export const WINDOW = {
  width: PANEL.width + EAR * 2 + SHADOW_PAD * 2,
  height: PANEL.height + SHADOW_PAD
}
