// TsukiSynth WebAssembly 入口（akasha-library）
//
// 只包一層：直接呼叫 tsuki-synth 既有的 ScoreParser / ScoreRenderer，
// 不修改任何引擎程式碼。JS 端（core/tsuki-worker.js）把 score.json 寫進
// Emscripten MEMFS 後呼叫 tsuki_render，再讀回 WAV。
//
// 這個檔案本身不含引擎；引擎原始碼在 build 時從 tsuki-synth 讀取，
// 產出的 .wasm 只放 private-assets/（專有授權，不進公開版）。
#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include "score/ScoreParser.h"
#include "score/ScoreRenderer.h"
#include "physics/MaterialDB.h"
#include <emscripten/emscripten.h>
#include <string>

// 由 scripts/build-tsuki-wasm.js 產生（內容 = tsuki-synth/data/materials.json）
namespace TsukiWasmData { extern const char* materials_json; extern const int materials_jsonSize; }

static MaterialDB gMaterials;
static std::string gLastMessages;

static void ensureMaterials()
{
    if (gMaterials.size() == 0)
        gMaterials.loadFromString (juce::String::fromUTF8 (TsukiWasmData::materials_json,
                                                           TsukiWasmData::materials_jsonSize));
}

static void collect (const std::vector<std::string>& lines)
{
    for (const auto& l : lines) { gLastMessages += l; gLastMessages += "\n"; }
}

extern "C" {

// 回傳 0 = 成功；1 = 樂譜解析失敗；2 = 渲染失敗。詳細訊息用 tsuki_last_message() 取得。
EMSCRIPTEN_KEEPALIVE int tsuki_render (const char* scorePath, const char* outPath)
{
    ensureMaterials();
    gLastMessages.clear();
    juce::File scoreFile (juce::String::fromUTF8 (scorePath));
    juce::File outFile (juce::String::fromUTF8 (outPath));

    Score score;
    if (! ScoreParser::parse (scoreFile, score))
    {
        collect (score.errors);
        if (gLastMessages.empty()) gLastMessages = "score parse failed\n";
        return 1;
    }

    ScoreRenderer renderer;
    renderer.setMaterialDB (&gMaterials);
    renderer.setBaseDir (scoreFile.getParentDirectory());
    outFile.deleteFile();
    const bool ok = score.hasLayers() ? renderer.renderLayered (score, outFile)
                                      : renderer.render (score, outFile);
    collect (renderer.getWarnings());
    return ok ? 0 : 2;
}

EMSCRIPTEN_KEEPALIVE const char* tsuki_last_message() { return gLastMessages.c_str(); }

}
