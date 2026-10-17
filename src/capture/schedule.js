// Capture timing and limits: which program steps each captured frame shows, GIF
// frame delays, and the memory estimate that refuses oversized captures up front.

export const GIF_MAX_FPS = 50 // GIF delays are whole centiseconds; browsers slow anything under 2 cs
export const MAX_CAPTURE_BYTES = 1.5e9
export const GIF_SIZE_LIMIT = 15_000_000

export const effectiveFps = (format, fps) => format === 'gif' ? Math.min(fps, GIF_MAX_FPS) : fps

export const frameCount = (seconds, fps) => Math.round(seconds * fps)

// Captured frame k shows the program after step floor(k*60*speed/fps). The epsilon
// keeps float error (e.g. speed 0.1) from landing one step early.
export function captureTargets({ seconds, fps, speed }) {
  return Array.from({ length: frameCount(seconds, fps) }, (_, k) => Math.floor(k * 60 * speed / fps + 1e-9))
}

// Frame delays in ms, in whole centiseconds, accumulated so the total stays exact
// (30 fps gives 30, 40, 30, ...).
export function gifDelays(fps, count) {
  const cs = k => Math.round(k * 100 / fps)
  return Array.from({ length: count }, (_, k) => (cs(k + 1) - cs(k)) * 10)
}

// Bytes of RGBA frame data the capture holds before encoding.
export function estimateCaptureBytes({ width, height, seconds, fps }) {
  return width * height * 4 * frameCount(seconds, fps)
}
