// Copyright 2026 Google LLC
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

/**
 * Shared deterministic configuration for LLM benchmarks.
 * Uses a fixed-length multi-paragraph context (~300 tokens) to exercise prefill
 * and generates a fixed number of tokens with greedy decoding (temperature = 0)
 * and EOS suppression to ensure deterministic compute workloads across runs.
 */

export const LLM_MAX_OUTPUT_TOKENS = 64;

export const LLM_BENCHMARK_PROMPT = `Sunlight reaches Earth's atmosphere and is scattered in all directions by all the gases and particles in the air. Because sunlight is composed of a continuous spectrum of electromagnetic radiation with wavelengths ranging from ultraviolet to infrared, its interaction with atmospheric constituents depends strongly on the size of the scattering particles relative to the wavelength of the incident light.

Earth's atmosphere consists primarily of molecular nitrogen (roughly 78 percent) and molecular oxygen (roughly 21 percent), along with trace amounts of argon, carbon dioxide, water vapor, and suspended aerosols. The diatomic nitrogen and oxygen molecules have effective diameters on the order of 0.3 nanometers, which is orders of magnitude smaller than the wavelengths of visible light (approximately 380 to 750 nanometers). When electromagnetic waves encounter particles that are much smaller than the wavelength of the radiation, elastic scattering occurs in the regime first mathematically formulated by Lord Rayleigh in the nineteenth century.

In this regime, the oscillating electric field of the incident solar radiation induces an oscillating electric dipole moment within the atmospheric gas molecules. These induced dipoles subsequently re-radiate electromagnetic energy in all directions. Crucially, the scattering cross-section is inversely proportional to the fourth power of the wavelength. Consequently, shorter-wavelength violet and blue light is scattered far more intensely than longer-wavelength orange and red light as sunlight traverses the atmosphere.

Based on the passage above, provide a comprehensive, detailed, step-by-step explanation of why the sky appears blue during the day, why it does not appear violet despite violet having a shorter wavelength, and how the path length of sunlight through the atmosphere causes the sky to shift toward red and orange hues during sunrise and sunset.`;
