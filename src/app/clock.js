// Fixed-step program clock: 60 steps per second of program time.
// tick() is driven once per display frame; speed sets steps per tick.

const ACC_START = 1 - 1e-6

export function createClock() {
  let speed = 1
  let acc = ACC_START
  const clock = {
    frame: 0,
    playing: false,
    get speed() {
      return speed
    },
    set speed(v) {
      const n = Number(v)
      speed = Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n))
    },
    get time() {
      return clock.frame / 60
    },
    tick() {
      if (!clock.playing) return []
      acc += speed
      const n = Math.floor(acc)
      acc -= n
      const steps = []
      for (let k = 0; k < n; k++) steps.push(clock.frame++)
      return steps
    },
    step() {
      const steps = [clock.frame++]
      clock.playing = false
      return steps
    },
    seek(i) {
      clock.frame = i + 1
      return [i]
    },
    reset() {
      clock.frame = 0
      acc = ACC_START
    },
  }
  return clock
}
