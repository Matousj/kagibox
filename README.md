# Kagibox — K.B. II
A web-based 256-bit password generator heavily inspired by the hardware aesthetics of Teenage Engineering. Features interactive sound synthesis (Web Audio API), animated OLED display, power states, and client-side cryptographic isolation.

---

## Technical Architecture & Security

### 1. Entropy Source & Rejection Sampling
Kagibox completely bypasses `Math.random()` due to its predictability. It uses the native browser **Web Crypto API** (`window.crypto.getRandomValues`) to gather cryptographically strong pseudo-random numbers (CSPRNG). 

To eliminate **Modulo Bias** (which causes statistical skewing toward certain characters in a pool), it implements unbiased **Rejection Sampling**. Every token has a mathematically uniform chance of selection.

### 2. Privacy & Memory Zeroization
* **Zero Telemetry:** Explicit meta tags and attributes (`spellcheck="false"`, `translate="no"`, `data-nosnippet`) block device OS dictionaries and cloud sync services from caching or logging the keys.
* **Buffer Purging:** Ephemeral strings are kept only in runtime memory. The `PURGE BUFFER` routine zeroizes variables and overrides the system host clipboard with blank spaces.
* **Power Savings:** When un-plugging the animated USB-C cable, the device switches to `battery-mode` and dims the interface variables. It drops into a deep `device-sleeping` state after 15 seconds of inactivity to save CPU.

---

## Mechanical Interface & Key Shortcuts

You can control the entire device workflow directly via mapped keyboard interactions:

* `I` / `O` — Physical hardware toggle (power on/off switcher).
* `Space` — Compute data and generate a new key register.
* `C` — Mirror display register directly into the system clipboard.
* `P` — Flush registers and purge clipboard memory.
* `M` — Cycle algorithm modes (Random pool ➔ Phonetic BIP-39 words ➔ Numeric PIN).
* `Slider` — Mechanical linear track to change target text length.

Live Demo: https://matousj.github.io/kagibox/
