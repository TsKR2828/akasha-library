import React from "react";

export function useCharactersOfWork(blocks, characters) {
  return React.useMemo(() => {
    const byId = new Map();
    for (const c of (characters || [])) {
      if (c?.id) byId.set(c.id, c);
    }
    for (const b of (blocks || [])) {
      if (b.type !== "dialogue") continue;
      const id = b.speakerId || "";
      if (id && byId.has(id)) continue;
      const name = b.speaker || id || "???";
      if (!id && !b.speaker) continue;
      const key = id || `_unknown_${name}`;
      if (byId.has(key)) continue;
      byId.set(key, {
        id: key,
        name,
        nameEn: name,
        voice: "",
        role: "",
        relations: "",
        tone: "",
        tags: [],
        notes: [],
        _fromBlocks: true,
      });
    }
    return [...byId.values()];
  }, [blocks, characters]);
}
