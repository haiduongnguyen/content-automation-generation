import type { ReelScriptScene } from "./reelScriptGenerator";

function assTime(seconds: number): string {
  const centiseconds = Math.round(seconds * 100);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\N").replace(/[{}]/g, "");
}

export function buildAssCaptions(scenes: ReelScriptScene[]): string {
  let start = 0;
  const dialogue = scenes.map((scene) => {
    const end = start + scene.targetSeconds;
    const alignment = scene.id === "insight" ? 2 : 5;
    const marginV = scene.id === "insight" ? 240 : 0;
    const text = `{\\an${alignment}\\fad(180,180)}${escapeAss(scene.caption)}`;
    const line = `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,${marginV},,${text}`;
    start = end;
    return line;
  });

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Caption,Noto Sans,70,&H00FFFFFF,&H000000FF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,5,1,2,90,90,180,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...dialogue,
    "",
  ].join("\n");
}
