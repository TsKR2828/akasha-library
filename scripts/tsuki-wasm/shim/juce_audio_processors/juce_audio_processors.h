// WASM shim：引擎只用到 juce_audio_basics 裡的 Synthesiser 類別，
// 不需要（也無法在 WebAssembly 編譯）juce_audio_processors 的 GUI 依賴。
#pragma once
#include <juce_audio_basics/juce_audio_basics.h>
