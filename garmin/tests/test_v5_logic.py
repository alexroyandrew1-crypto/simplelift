#!/usr/bin/env python3
"""Headless checks for v5 scroll-wheel math and auto-detect thresholds.
Ports the watch's RepDetector + wheel rules; does not run the Connect IQ simulator.
"""
import math
import sys

# ---- scroll wheel (mirrors LiftDelegate) ----
WHEEL_PX = 22
WHEEL_MAX = 8

def wheel_steps(dy_up_pixels, already=0, extra=0):
    """dy_up_pixels: finger travel upward in px (down is negative)."""
    steps = dy_up_pixels // WHEEL_PX
    steps += extra
    # cap cumulative
    nxt = already + steps
    if nxt > WHEEL_MAX:
        steps = WHEEL_MAX - already
    if nxt < -WHEEL_MAX:
        steps = -WHEEL_MAX - already
    return steps

def flick_extra(vel_px_s):
    if vel_px_s >= 800:
        return 2
    if vel_px_s >= 400:
        return 1
    return 0

def test_wheel():
    assert wheel_steps(0) == 0
    assert wheel_steps(21) == 0          # short drag; onSwipe supplies 1 later
    assert wheel_steps(22) == 1
    assert wheel_steps(-22) == -1        # down decreases
    assert wheel_steps(88) == 4          # larger swipe, more steps
    assert wheel_steps(22 * 20) == 8     # cap
    assert wheel_steps(22, already=0, extra=flick_extra(400)) == 2
    assert wheel_steps(22, already=0, extra=flick_extra(800)) == 3
    assert wheel_steps(22 * 7, already=0, extra=2) == 8  # cap with bonus
    print("wheel: ok")

# ---- RepDetector port (mirrors RepDetector.mc) ----
class RepDetector:
    RATE = 25
    HI = 120.0
    LO = 30.0
    MIN_GAP = 18
    IDLE = 200
    MUTE = 75
    A_BASE = 0.025
    A_SMOOTH = 0.35

    def __init__(self):
        self.count = 0
        self.lastRepAt = -100000
        self.n = 0
        self.base = 1000.0
        self.s = 0.0
        self.armed = True
        self.fast = 0
        self.mutedUntil = 0
        self.events = []

    def reset(self):
        self.count = 0
        self.fast = 0

    def sample(self, mag):
        self.n += 1
        if self.n == 1:
            self.base = mag
        self.base += self.A_BASE * (mag - self.base)
        self.s += self.A_SMOOTH * ((mag - self.base) - self.s)
        if self.count > 0 and self.n - self.lastRepAt > self.IDLE:
            self.count = 0
            self.fast = 0
            self.events.append(0)
        if self.n < self.mutedUntil:
            self.armed = self.s < self.LO
            return
        if self.armed and self.s > self.HI:
            self.armed = False
            if self.n - self.lastRepAt >= self.MIN_GAP:
                self.count += 1
                self.lastRepAt = self.n
                self.events.append(self.count)
            elif self.count > 0:
                self.fast += 1
                if self.fast >= 2:
                    self.count = 0
                    self.fast = 0
                    self.mutedUntil = self.n + self.MUTE
                    self.events.append(0)
        elif (not self.armed) and self.s < self.LO:
            self.armed = True

    def feed_sine(self, seconds, period, amp=350.0):
        for i in range(int(seconds * self.RATE)):
            ts = i / self.RATE
            v = 1000.0 + amp * math.sin(2 * math.pi * ts / period)
            self.sample(v)

# Auto-detect thresholds (mirrors LiftModel)
AUTO_MIN_REPS = 3
AUTO_MIN_SAMPLES = 36
AUTO_REPS_MAX = 30
AUTO_REPS_SLACK = 8
AUTO_STILL_MS = 3000
AUTO_UNDO_MS = 5000
AUTO_DEBOUNCE_S = 8

def reliable(detected, planned):
    if detected < AUTO_MIN_REPS or detected > AUTO_REPS_MAX:
        return False
    if planned > 0 and detected < (planned * 2) // 5:
        return False
    if detected > planned + AUTO_REPS_SLACK:
        return False
    return True

def would_auto(det, motion_start_n, live_reps, resting=False, done=False, focus=0, now=100, block_until=0):
    if resting or done or focus != 0:
        return False
    if det.fast != 0:
        return False
    if now < block_until:
        return False
    detected = live_reps if live_reps > 0 else det.count
    if detected < AUTO_MIN_REPS:
        return False
    if det.lastRepAt - motion_start_n < AUTO_MIN_SAMPLES:
        return False
    return True

def test_auto():
    # Lift-like 2.2 s reps for 10 s should count at least 3 and span >= 1.44 s
    d = RepDetector()
    d.feed_sine(10.0, period=2.2)
    assert d.count >= 3, d.count
    # first counted rep is events of 1; use lastRepAt - start of first rep
    first = None
    n = 0
    # reconstruct start: walk events
    # approximate: lastRepAt - (count-1)*something; instead re-feed tracking first
    d2 = RepDetector()
    first_n = None
    orig_sample = d2.sample
    def wrapped(mag):
        before = d2.count
        orig_sample(mag)
        if first_n is None and d2.count == 1 and d2.count > before:
            # can't assign in closure easily
            pass
    # simpler: after feed, lastRepAt - first event time
    # Re-simulate and record n at first count
    d3 = RepDetector()
    first_at = None
    for i in range(int(10 * 25)):
        ts = i / 25.0
        v = 1000.0 + 350.0 * math.sin(2 * math.pi * ts / 2.2)
        prev = d3.count
        d3.sample(v)
        if first_at is None and d3.count == 1 and d3.count != prev:
            first_at = d3.n
    assert first_at is not None
    assert would_auto(d3, first_at, d3.count)
    assert d3.lastRepAt - first_at >= AUTO_MIN_SAMPLES

    # Walking 0.5 s cadence should mute / not auto
    w = RepDetector()
    w.feed_sine(8.0, period=0.5)
    # After walking-like peaks, count should be 0 and/or muted
    assert w.count == 0 or w.fast != 0 or w.n < w.mutedUntil or not would_auto(w, 0, w.count)
    # Explicit: would_auto requires count >= 3 and fast == 0
    if w.fast == 0 and w.count >= 3:
        raise AssertionError(f"walk should not look like a set: count={w.count} fast={w.fast}")

    # Short bump: 1 s of motion, not enough reps/span
    b = RepDetector()
    b.feed_sine(1.0, period=2.2)
    first_b = None
    # recount
    b = RepDetector()
    for i in range(25):
        ts = i / 25.0
        v = 1000.0 + 350.0 * math.sin(2 * math.pi * ts / 2.2)
        prev = b.count
        b.sample(v)
        if first_b is None and b.count == 1 and b.count != prev:
            first_b = b.n
    assert not would_auto(b, first_b or 0, b.count), (b.count, first_b, b.lastRepAt)

    # Reliable detected reps
    assert reliable(5, 5)
    assert reliable(4, 5)
    assert reliable(13, 5)  # 5+8
    assert not reliable(14, 5)
    assert not reliable(2, 5)
    assert not reliable(1, 10)   # below 40%
    assert not reliable(31, 30)
    assert reliable(4, 10)       # 40% of 10
    assert not reliable(3, 10)

    # Ignore during rest / focused / done / debounce
    assert not would_auto(d3, first_at, d3.count, resting=True)
    assert not would_auto(d3, first_at, d3.count, done=True)
    assert not would_auto(d3, first_at, d3.count, focus=1)
    assert not would_auto(d3, first_at, d3.count, now=5, block_until=13)

    print("auto-detect: ok")
    print(f"  lift 10s @ 2.2s -> {d3.count} reps, span {d3.lastRepAt - first_at} samples ({(d3.lastRepAt - first_at)/25:.2f}s)")
    print(f"  walk 8s @ 0.5s -> count={w.count} fast={w.fast} muted={w.n < w.mutedUntil}")
    print(f"  thresholds: min_reps={AUTO_MIN_REPS}, still={AUTO_STILL_MS}ms, min_span={AUTO_MIN_SAMPLES} samples, undo={AUTO_UNDO_MS}ms, debounce={AUTO_DEBOUNCE_S}s")

def main():
    test_wheel()
    test_auto()
    print("all headless checks passed")
    return 0

if __name__ == "__main__":
    sys.exit(main())
