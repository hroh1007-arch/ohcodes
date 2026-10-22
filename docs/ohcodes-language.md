# ohcodes language — v0.20

This standalone edition opens the workspace at `/`. The portfolio edition uses `/ohcodes`; its former `/ohsounds` link redirects there. The language and playback behavior are the same in both editions.

## In-app Manual

The **Studio / Manual** tabs separate making music from learning it. Manual starts at zero with sixteen bilingual English/Chinese chapters: the workspace, first sound, drum groove, rests/subdivisions, meters/loops, notes/chords/duration, named tracks, mute/solo, scales/degrees, timbres, groove/effects, calculation/repetition, passage performance, Song arrangement, saving, and troubleshooting. Every musical lesson includes a complete copyable project, expected listening result and a small exercise. The soundbank list comes from the actual built-in library. Chapter search matches both languages and code; Previous/Next follows the full learning sequence.

Manual only copies examples to the clipboard; it never loads, replaces, re-evaluates or auto-plays them. The instructions explain how to export existing work before trying an example in a new song. Switching tabs retains the mounted editor, selection, scroll position, project, playback and lesson. The shared top transport still controls the Studio project. Re-evaluate and passage-launch shortcuts are scoped to Studio so reading or searching the Manual cannot apply hidden drafts. Project export remains available with Cmd/Ctrl+S. Workspace tabs support arrow keys, Home/End and accessible tab/panel relationships.

Start with silence and write your own rhythm:

```text
tempo 122
time 4/4

passage"Verse"{
  bd([][][][])
  sd([][][][])
}
```

For drums, each `[]` is one beat of a repeating groove, set by the time signature's denominator. In 4/4, use four quarter-note beats; in 6/8, use six eighth-note beats. `[]` is silent. `1` triggers a drum; `~` or `0` is a rest. Spaces are ordinary spaces, and a beat's contents divide its time equally. These are sound triggers, not sustained note lengths:

| Beat in 4/4 | Meaning |
| --- | --- |
| `[1]` | One quarter-note trigger |
| `[~ 1]` | Eighth rest, then eighth trigger |
| `[1 1 1]` | Three eighth-note triplet triggers |
| `[1000]` | Four sixteenth-note steps, only the first triggered |

A comma adds a bar, up to four written bars per instrument. Line breaks within the parentheses are allowed:

```text
passage"Verse"{
  bd(
    [1][][1][],
    [1][][][~ 1],
    [1][~ 1][1][]
  )
  sd([][1][][1], [][1][][1], [][1][][1], [][1][][1 1])
}
```

Each instrument loops independently. Here, the bass drum loops every three bars and the snare every four. They meet again after twelve bars; those twelve bars do not need to be written out. With no comma, the instrument loops its one written bar.

Click a passage name to edit it without affecting playback. Click its launch arrow or use Cmd/Ctrl + Shift + 1–9 to switch on the next bar. Every instrument in the newly launched passage starts at its first bar, while the global transport continues. Cmd/Ctrl + Enter re-evaluates the editing passage on the next bar. Re-evaluating the currently playing passage preserves elapsed bars, including when an instrument's loop length changes. Invalid code leaves the last valid playback running.

The optional `steps` helper edits the same source text; opening it does not fill empty brackets. It supports mixed subdivisions and all written bars. Grid changes keep existing hits at their exact positions or reject the change if the new grid cannot represent them. Opening a repeated or calculated drum pattern does not rewrite it. Editing one expands that row into explicit bracket groups first, so an individual step can change without changing every repetition; its other modifiers stay intact.

## Calculation and repetition

Numeric values accept `+`, `-`, `*`, `/`, unary signs, decimal numbers and nested parentheses. Multiplication is one `*`, not `**`. Multiplication/division bind more tightly than addition/subtraction; operations of the same precedence evaluate left to right. For example, `10+5*2` is 20, `(10+5)*2` is 30, and `24/3/2` is 4.

```text
tempo 60*2
time 4/4

passage"Verse"{
  bd([]*4)
  hh([1 0]*(2+2)).velocity(10*8, (30+10)*2).volume(-3*4)
  keys([(1+2) (8/2)]).scale("C(1+2) major")
    .effects("reverb", 10+15, 1+1)
    .effects("delay", 5*4, 1/(4*2), 7*5)
}

song{
  "Verse" 2*4
}
```

This example calculates tempo 120, velocity 80, volume −12 dB, E3/F3 from scale degrees 3/4, 25% reverb with a two-second decay, eighth-note delay, and an eight-bar Song section. The kick stays silent. Expressions are evaluated when code is applied; they do not change automatically over time. This release supplies arithmetic and bounded repetition, not variables, user-defined functions, random/Euclidean generators or time-varying automation.

| Numeric position | Example | Result |
| --- | --- | --- |
| Tempo | `tempo 60*2` | 120 beats/minute |
| Meter | `time (3+3)/(2*4)` | 6/8 |
| Velocity / volume / swing | `.velocity(10*8).volume(-3*4).swing(50+5)` | 80 / −12 dB / 55% |
| Effect parameter | `.effects("filter", 1000*(1+1))` | 2000 Hz |
| Sync delay rate | `.effects("delay", 20, 1/(4*2), 35)` | `"1/8"` |
| Note or scale root octave | `C(1+2)` / `.scale("C(1+2) major")` | C3 / C3 major |
| Scale degree | `[(1+2) (8/2)]` | Degrees 3 then 4 |
| Chromatic accidental degree | `[#(1+1) b(1+2)]` | Sharp 2 then flat 3 |
| Song section bars | `"Verse" 2*4` | Eight bars |

The top-level `/` in `time` separates the numerator and denominator. Put division within either number in parentheses: `time (8/2)/4` is 4/4. Each computed number must still meet its existing range and integer rules. Meter numerators remain 1–16 and denominators remain 2/4/8/16; velocity remains integer 1–127. Drum expressions inside a group, such as `[(2-1) (8/8)]`, must each produce exactly 0 or 1. Compact binary forms such as `[0101]` retain their original meaning. Names and identifiers such as `"808"`, `t1` and chord suffix `maj7` are not calculated.

`*` keeps its musical meaning in context:

| Context | Example | Meaning |
| --- | --- | --- |
| After a bracket group | `[1 0]*4` or `[]*(2+2)` | Repeat that group four times within the current bar |
| Inside a quoted drum rhythm | `hh("x*(2+2)")` | Four equally spaced triggers across the bar |
| After a melodic token | `[C3*(1+1) G3]` | Give C two time shares and G one, just like `[C3*2 G3]` |
| Inside a numeric expression | `[(1*2)]` with a scale | Compute degree 2; it is not a time weight |

Keep computed degrees and any expression containing spaces inside parentheses when writing space-separated rhythm/note tokens. `[(1 + 2) (8 / 2)]` contains two events. Ordinary spaces still separate musical events, not operators outside the parentheses.

Repeating a group does not add bars: in 4/4, `bd([]*4)` expands to four silent beats and `keys([C3]*4)` gives four one-beat Cs. `keys([C3])` remains one four-beat C. Drum group counts after expansion must match the meter; melodic groups still divide the entire bar. Use commas for 1–4 written bars. Each group repeat is a positive whole number at most 64, with at most 64 expanded groups per bar; quoted token repeats remain 1–32 and their total remains at most 64 slots. Existing event limits still apply after expansion.

Division by zero, unfinished/unsupported syntax, non-finite values, non-integer counts and out-of-range results report errors instead of rounding or silently clamping. Numeric expressions are limited to 2048 characters, 256 tokens and 32 nested parentheses; intermediate magnitudes may not exceed JavaScript's maximum safe integer. The evaluator accepts arithmetic only and does not run JavaScript. Invalid drafts retain the last valid music. Re-evaluation still applies at the next bar without resetting elapsed transport or velocity phase.

Saved projects preserve formulas as written. Effect sliders display calculated values; moving one replaces only the changed parameter with a literal value, preserving untouched argument formulas, quotes, comments and other effects. Steps expands the edited rhythm as described above. Graphical Song order edits may write explicit calculated bar counts. These are code edits and do not preserve an algebraic formula that the user has replaced with a graphical value.

## Writing code

The editor colors instruments, notes, numbers, rests, passage/control names, strings, comments and modifiers. Place the caret beside a bracket or inside a group to highlight its matching pair. Coloring never changes the source; ordinary spaces, selection, copying and scrolling still work in the text editor.

On an empty instrument line, type a part name such as `bd` or a prefix such as `p`. The inline list shows matching instruments and a silent template. Use ↑/↓ to choose, Tab/Enter to insert, or Escape to dismiss. In 6/8, `bd` inserts `bd([][][][][])`; in 3/4 it inserts `bd([][][])`. The caret lands inside the first empty bracket. The current passage's time signature overrides the global one. Suggestions do not appear inside notes, comments, Song orders or an existing instrument's brackets. An unfinished/invalid time signature must be completed before inserting a template. No sound is triggered or applied by accepting a suggestion.

Inside `.volume(...)` and a named `.effects(...)`, inline hints explain units, parameter order and allowed ranges. These join the existing velocity/swing hints and sound/effect name search. Escape dismisses help; no modal opens.

After a brief typing pause, the editor checks the selected passage using the playback compiler. A wavy underline and marked line number identify the first issue; click the message or marked number to select it. Missing delimiters point to the opening bracket; note and modifier errors point to the affected code. Passage-wide errors point to the passage heading. Fixing the text clears its diagnostic. Diagnostics are draft feedback only: they neither run code nor stop the last valid music, and an invalid unselected passage stays independent. Song-order validation remains in the Song panel. Cmd/Ctrl + Enter still applies valid edits at the next bar.

## Song and Live modes

Arrange a complete song without changing the instrument syntax. Put one `song{...}` block outside the passages, above or below them:

```text
song{
  "Intro" 4
  "Verse" 8
  "Chorus" 8
  "Verse" 8
  "Outro" 4
}
```

Each number is the section's length in bars, not the number of repetitions of an instrument's pattern. Names must match existing passages; repeated sections are allowed. Use 1–256 whole bars per section, up to 128 sections and 4096 bars per song. Ordinary `//` comments and single or double quoted names work. An empty or missing order cannot start Song playback.

Select **Song**, then **Play**. Every referenced passage is compiled before starting, including later sections; an unused unfinished passage does not block the song. Sections switch automatically on bar boundaries. Every occurrence starts its passage's instruments at their first bar; independent 1–4-bar loops repeat within the section and may be cut short by its end. Each section uses its passage's tempo and time signature. The global transport continues across changes, while the Song counter shows the position within the arrangement. After its last full bar the song stops and clears voices/effect tails; Play starts again from the first section.

The **Song order** controls add/remove sections, select passages, change bar counts and move sections up/down. They edit the same `song{...}` source block. Bar fields commit on blur or Enter. Controls never insert drum hits or melodies, and changes are drafts until re-evaluated. Renaming a passage with the Rename control also updates its matching order references. Renaming it directly in text requires updating those references yourself.

Cmd/Ctrl + Enter in Song mode compiles the whole arranged song, not just the editing passage. While playing, valid changes enter on the next bar and preserve elapsed Song bars rather than restarting at zero. If lengths/order change, that same elapsed position is mapped into the new order; shortening the song past the playhead ends it at the next boundary. Errors retain the last applied song. The editing passage can differ from the playing section without affecting playback. Effect sliders on the playing passage update that passage's occurrences in the applied song on the next bar without changing its order; a queued mode/order change takes priority.

**Live** keeps the existing manually launched, repeating-passage workflow. Selecting Live during a song keeps the current passage and its loop position on the next bar. A passage launch arrow or Cmd/Ctrl + Shift + 1–9 also leaves Song mode on the next bar, starting the chosen passage from bar 1. Selecting Song while Live is playing starts the first arranged section at the next bar. Queued changes can be cancelled before the scheduler commits the boundary. Stop clears queues and resets positions.

Automatic saving and `.ohcodes` export preserve the complete order as part of the source code, without changing the version-1 project schema. Restoring/opening a project is stopped in Live mode; select Song to play its arrangement. Live passage compilation is independent of an unfinished Song order, so an order draft does not interrupt valid Live music.

Built-in drums: `bd`, `sd`, `hh`, `oh`, `cym`, `rd`, `rim`, `t1`, `t2`, `t3`, `ft`. Running `ins.drums` in a passage without drum rows inserts all eleven silent drums, preserving any melodic instruments. Older `bd[1000][][][]`, `|` bar separators, and quoted live rhythms such as `hh("x*8")` remain supported. The four-bar limit applies to both old and new forms.

## Notes and chords

Melodic rows are `bass`, `keys`, `piano`, `synth`, `pad`, `pluck`, and `guitar`. They can have independent 1–4-bar loops, but their brackets divide a whole bar into equal groups rather than requiring one bracket per beat:

```text
passage"Verse"{
  bd([1][][1][]).timbre("house")
  bass([C2][][G2][~ C2]).timbre("sub")
  keys([C3&E3&G3][][][G3&B3&D4]).timbre("electric-piano")
  synth([C4 D4 E4][][G4*3 E4][]).timbre("saw")
  pad([C3maj7]).timbre("warm-pad").volume(-9)
}
```

In 4/4:

| Melodic row | Note duration |
| --- | --- |
| `keys([C3&E3&G3])` | One chord for all four beats |
| `keys([C3maj][Dm])` | Two chords, two beats each |
| `keys([C3&E3&G3][][][])` | Chord for one beat, then three beats of rest |

An empty `[]` is a rest, not a continuation. An all-empty row remains silent. No tie/hold symbol is needed: fewer groups make longer notes. In 3/4, a single group occupies three quarter-note beats; in 6/8, two groups occupy three eighth-note beats each. Up to 64 groups can divide a melodic bar, and each comma-separated bar may use a different number of groups.

Notes inside a bracket divide that group equally. `keys([C4 D4 E4])` divides the entire bar into three notes; `keys([C4 D4 E4][][][])` divides only the first beat into three notes. `~`, `～`, or `0` rests. A time weight changes a token's share of its group: `keys([C4*3 G4])` gives C three beats and G one in 4/4, while `keys([C4*3 G4][][][])` gives C three quarters of the first beat and G its remaining quarter. A lone `[C4*4]` fills its group exactly as `[C4]` does. Notes stay within their group; the next note on the same instrument replaces the previous voice with a short fade. A natural sound release may ring into a rest, but rests do not retrigger or hold notes. Starting the next written bar or looping starts its notes normally.

Use note names with octaves, sharps and flats: `C2`, `F#3`, `Bb3`. Lowercase works; omitted octaves default to 4. The supported range is MIDI 0–127, from C-1 to G9. `C3&E3&G3` plays a chord together; spaces around `&` are allowed. Named chords use `maj`, `min`/`m`, `maj7`, `min7`/`m7`, `dom7`, `dim`, `sus2`, or `sus4`, after the root and optional octave: `C3maj7`, `Dm`, `G3dom7`. `C7` unambiguously means the note in octave 7; use `Cdom7` for a dominant chord. Chords are limited to eight notes, and melodic tracks together to 128 note triggers per bar.

Adding a melodic instrument inserts empty brackets, never an automatic melody. The drum step helper does not rewrite pitched rows. Quoted `x`/`~` patterns remain a drum feature.

## Named tracks and layers

```text
passage"Verse"{
  chords = keys([1&3&5]).scale("C3 major")
    .timbre("electric-piano").volume(-12)
  melody = keys([1 2][3][5][3]).scale("C4 major")
    .timbre("piano").volume(-6)
  kick = bd([1][][1][])
}
```

`name = instrument(...)` creates an independent track. Names use 1–48 ASCII letters, digits or underscores, starting with a letter or underscore; they are case-sensitive. A name must be unique within a passage, including across different instrument types. Other passages can define the same name independently. There is no cross-passage pattern sharing or general variable evaluation: `melody = chords` and track arithmetic such as `melody = chords*2` are unsupported. Numeric arithmetic is supported in numeric parameters as described above. Up to 64 instrument rows per passage are allowed; existing 128-pitched-note and 512-event-per-bar limits still apply across all tracks.

Naming is optional. Existing unnamed rows keep their behavior and can coexist with named rows of the same instrument. Multiple simultaneous named keys/chords or drums are layered, not deduplicated. Every track has independent loop length, scale, timbre, volume, effects, velocity phase and swing. A melodic note replaces only the previous voice on its own track. Name changes and instrument changes apply on the next bar after re-evaluation; they retire the old route and create a new one without resetting transport. Removed tracks stop feeding audio at that boundary; existing effect tails may decay for up to 32 seconds. At most 64 retired track routes are retained; excessive rapid renaming clears the oldest route early. Stop clears every route and tail.

After `chords = `, type an instrument prefix and use Tab/Enter for its silent template. Sound/scale/effect completion preserves the assignment. Steps, effect sliders and applied-track status use track names; edits target only the selected row, including when another passage has the same name. Project exports preserve names as source text without changing the file format. The Manual includes a complete two-keys-layer lesson.

## Passage mute and solo

```text
passage"Verse"{
  chords = keys([C3&E3&G3])
  melody = keys([C4][E4][G4][E4])
  kick = bd([1][][1][])

  solo(melody, kick)
  mute(kick)
}
```

This plays only `melody`. `solo(...)` restricts playback to its list; `mute(...)` then excludes its list, regardless of line order. Each command occupies one line inside the passage, usually below its instruments. Use at most one of each command and comma-separated case-sensitive track labels without quotes. Repeated names in one list are harmless. Unnamed rows use their instrument name (`mute(bd, hh)`); named rows use their assigned name, not their instrument type. If a named and unnamed row share a label, rename one before selecting it. Unknown or ambiguous names are errors, not silent no-ops. A command outside a passage is rejected; older implicit-passage source still works.

An empty list (`mute()` or `solo()`) disables that filter; removing the line does the same. With both filters disabled, all tracks play. Selections belong to their passage and never leak into another passage. A fully muted passage still advances transport and Song arrangement. Re-evaluation applies on the next bar while preserving elapsed loops and velocity phase. All rows compile and count toward event limits even when muted. Invalid drafts leave the last valid playback unchanged.

The track's post-effect output uses a 20 ms fade, so mute silences existing notes and reverb/delay tails as well as future triggers. Effects continue decaying silently and a remaining tail can be heard when unmuted. Existing routes are reused; Stop disconnects all routes. Removing or renaming a track retains the previous natural-tail behavior described above.

Typing inside either command offers inline names from the same passage, filtered by the typed text. Tab/Enter completes, arrows choose, and Escape dismisses. Completions edit code only; re-evaluation applies it. Applied playback status lists the audible tracks and current selection. Manual includes a bilingual mute/solo lesson; project saves and exports preserve commands as source text.

## Instrument scales and degrees

```text
passage"Verse"{
  keys([1&3&5]).scale("C3 major").timbre("electric-piano")
  bass([1][3][5][8]).scale("C1 minor")
  synth([1 #1 2 #2][3 4 #4 5][#5 6 #6 7][8 7 b7 6]).scale("C4 chromatic")
}
```

`.scale()` belongs after an individual melodic instrument, never globally or before/inside a passage as a separate control. Use one quoted root-with-octave and mode per row. Case-insensitive roots/mode names, sharps and flats work: `c1 major`, `Bb2 minor`, `F#3 dorian`. Supported modes: major/ionian, natural minor/aeolian, dorian, phrygian, lydian, mixolydian, locrian, chromatic. Other minor variants are not implied by `minor`.

Positive whole numbers are scale degrees. In C3 major, `1&3&5` is C3/E3/G3; in C3 minor it is C3/Eb3/G3. `8` always means the next-octave root and `15` is two octaves up. Spaces separate events (`[1 3]`); `[13]` is a single thirteenth degree, not a binary pattern. `0`, `~`, `～` and empty groups remain rests. Chords with `&`, proportional time weights such as `[1*3 5]`, bar groups, commas, velocity and swing keep existing timing semantics. Degrees require a scale; there is no implicit scale or octave. Drums reject `.scale()` and retain their 0/1 trigger grammar.

Chromatic uses altered major-reference degrees, **not** semitone numbers 1–12. Ascend `1 #1 2 #2 3 4 #4 5 #5 6 #6 7 8`; descend `8 7 b7 6 b6 5 b5 4 3 b3 2 b2 1`. A single `#` raises a degree one semitone; a single lowercase `b` lowers it. Prefix accidentals are exclusive to chromatic, not changes to the major/minor/mode rules. Higher degrees keep seven-note octave numbering. Explicit note names are not quantized to the scale. Within chromatic, lowercase `b3` means flat third, so write uppercase `B3` for the B note; `Bb3` still means B-flat. Outside chromatic the existing lowercase B note spelling is unchanged.

Type `.sc` for a Scale modifier suggestion. Its silent `.scale("")` template places the caret between quotes without picking a default. Inside the argument, type a root with octave, such as `C3`, to list modes, or `C3 m` to filter. Search accepts unfinished quoted or unquoted drafts and inserts a complete quoted modifier. ↑/↓ chooses, Tab/Enter completes, Escape dismisses. Completion never applies playback; Cmd/Ctrl+Enter applies on the next bar, preserving elapsed loops and Song position. Empty arguments show a parameter hint, not a modal. Invalid names, duplicate scales, missing root octaves and pitches outside MIDI 0–127 retain the last valid music. Project files preserve scale source unchanged. The Manual has a complete bilingual scale lesson.

## Soundbanks

```text
bd([1][][1][]).timbre("808")
sd([][1][][1]).timbre("studio")
hh([1 1][1 1][1 1][1 1]).timbre("lofi")
```

`timbre` selects the sound, not the notes or rhythm. There are 8 complete drum kits (each covers all eleven drum parts) and 17 melodic presets:

| Family | Timbre IDs |
| --- | --- |
| Drum kits | `studio`, `808`, `lofi`, `909`, `606`, `house`, `techno`, `boombap` |
| Bass | `sub`, `round-bass`, `saw-bass` |
| Keys | `piano`, `electric-piano`, `organ` |
| Synth | `sine`, `saw`, `square`, `fm` |
| Pad | `warm-pad`, `strings`, `air-pad` |
| Pluck | `pluck`, `bell`, `mallet`, `guitar` |

All presets are original Web Audio synthesis, not Kontakt sounds or third-party sample recordings. Piano, guitar and strings are synthesized approximations, not recorded acoustic instruments. The 808/909/606 names describe electronic styles, not exact hardware emulations. Drum kits use noise and oscillator layers; melodic voices use harmonic layers, detuning, filters, ADSR envelopes, and FM where applicable.

Any melodic timbre can be used by any melodic row: a bass line can use `piano`, for example. Drum kits and melodic sounds cannot be substituted for each other; incompatible choices produce an error. Defaults: drums `studio`, bass `sub`, keys `electric-piano`, piano `piano`, synth `saw`, pad `warm-pad`, pluck `pluck`, guitar `guitar`.

Type a name inside `.timbre(...)` and a small completion list appears beneath the editing cursor. There is no modal, separate search field, or sound-selection button. A dot, `.timbre()`, or `.timbre("")` alone shows no list. On a drum row, `s` finds Studio and House; on a melodic row, it finds compatible names such as Sub bass, Saw bass, Sine lead, Saw lead, Square lead and Strings. Matching is case-insensitive and searches anywhere in the name or ID, not its description. Keyboard navigation scrolls longer result lists without moving the editor cursor.

You may type an unquoted draft such as `.timbre(s)` or start a quoted name such as `.timbre("s`. Use ↑/↓ to choose, Enter/Tab to complete, or click a result. Completion inserts valid quoted syntax, such as `.timbre("studio")`, preserving the rhythm, comments, other instruments, and passages. Escape dismisses the list without changing your text. It stays hidden until you change the query or move the cursor. Moving out of the argument or clicking away also hides it; the editor never loses focus to a separate search interface. The completion list replaces the previous modal and its standalone audition controls.

Selecting a bank edits the draft only. Cmd/Ctrl + Enter still re-evaluates instead of accepting a suggestion; while playing, it applies the edited passage on the next bar, retaining elapsed loop positions. An incomplete draft or unknown bank leaves the last valid playback running. Legacy `kit "808"` sets a passage default; explicit per-instrument `.timbre()` overrides it.

## Instrument volume

```text
bd([1][][1][]).timbre("house").volume(-6)
keys([C3maj7]).timbre("electric-piano").volume(-9)
bass([C2][G2]).volume(-3).timbre("sub")
```

`.volume()` uses decibels, not percentages. The default is 0 dB (unchanged); −6 dB reduces the instrument's amplitude to about half. The supported range is −60 to +6 dB, including decimals. Volume works on both drum grooves and melodic instruments, before or after `.timbre()`. Use one volume and one timbre per instrument. It does not change note lengths, rhythm, or independent loops.

Each instrument has its own gain before the shared master compressor. Changes apply smoothly on the next bar after re-evaluation. The sidebar shows the applied dB levels, not unsent draft values. Timbre completion and drum step edits preserve volume modifiers, comments, and other source text. Invalid levels leave the last valid playback running.

## Velocity and Swing

Write groove changes in the same instrument chain; modifiers can stay on one line or continue on separate lines:

```text
hh([1 1][1 1][1 1][1 1])
  .velocity(90, 45)
  .swing(60)
  .timbre("studio")

keys([C3maj D3min][][][]).velocity(100, 70).swing(60)
```

`.velocity()` accepts 1–64 MIDI-style strengths, whole numbers from 1 to 127. Values repeat across actual hits of that instrument, continuing across written bars and loop boundaries. Rests do not advance the sequence, and a chord uses one value for all its notes. For example, three hits with `.velocity(90, 45)` play 90/45/90 in bar 1, then 45/90/45 in bar 2. A single value gives every hit the same strength. 127 keeps the original sound level; lower values scale the amplitude by value/127, before per-instrument volume and effects. This is amplitude-based velocity, not recorded sample layers or velocity-dependent timbre. Omitting it preserves the existing sound.

`.swing()` accepts 50–75%, including decimals. 50 is straight timing. 60 splits each denominator beat into 60:40 halves: in 4/4 a pair of eighths starts at beat positions 0 and 0.6, instead of 0 and 0.5. Sixteenth positions become 0/0.3/0.6/0.8. Whole beats, bar lengths, tempo and independent track loops stay fixed. In 6/8 it swings subdivisions of each eighth-note beat; it does not reinterpret compound meter as paired dotted-quarter beats.

Swing applies to straight power-of-two grids: drum groups with 1/2/4/8/16/32/64 slots, compatible quoted patterns such as `hh("x*8")` in 4/4, and equally spaced, unweighted melodic grids that align to denominator beats. Three- or six-slot drum groups, triplet/other irregular melodic grids, and groups containing `*` time weights retain their written timing. Melodic note gates follow the same warp at their start and end, so adjacent swung notes meet without shortening the bar. Rests remain silent. Use one velocity sequence and one swing amount per instrument, in any order among timbre, volume and effects.

Type `.v` or `.s` to get an inline name suggestion; ↑/↓, Enter/Tab and Escape work like soundbank completion. A bare dot has no menu. Inside `.velocity(...)` or `.swing(...)`, a non-interactive hint explains the units, range and musical behavior, including for an empty/incomplete argument. Hints never move focus, rewrite numbers or apply playback. Cmd/Ctrl + Enter still re-evaluates. Other code, comments, passages and modifier chains are preserved.

Changes apply on the next bar. Re-evaluation retains elapsed passage/Song bars and computes velocity phase at that position under the new rhythm, rather than restarting from the first value. Manual passage launches and each Song section occurrence start at their first hit. Invalid or unfinished modifiers leave the last valid playback running. Saving/opening `.ohcodes` preserves these modifiers as source, including unfinished drafts. Drum step helpers still show the written, unswung grid and retain groove modifiers. Grid resizing rejects a straight/triplet conversion if it would change the audible swung hit times, rather than silently removing Swing.

## Effects and sliders

```text
keys([C3maj]).timbre("electric-piano").effects("reverb", 25)
hh("x*8").effects("delay", 20, "1/8", 35)
synth([C3]).effects("filter", 1800).effects("reverb", 15, 3)
```

Effects are per instrument, for both drums and melodic sounds. Chain them in the order you want the audio processed, from left to right. Timbre produces the sound; volume always precedes the effect chain, regardless of its position in the code. Use one of each effect per instrument. A missing chain means dry audio, and removing an effect bypasses it after re-evaluation.

| Effect | Parameters | Defaults and limits |
| --- | --- | --- |
| `reverb` | Mix %, optional decay seconds | 25%, 2s; mix 0–100, decay 0.1–8s |
| `delay` | Mix %, optional quoted note length, optional feedback % | 20%, `"1/8"`, 35%; mix 0–100, feedback 0–80 |
| `filter` | Low-pass cutoff Hz | 1800 Hz; 20–20000 Hz |

You may omit all parameters, e.g. `.effects("reverb")`. Delay accepts `"1/2"`, `"1/4"`, `"1/8"`, `"1/16"`, and `"1/32"`; append `.` for dotted notes or `t` for triplets. Calculated rates may be quoted or unquoted: `1/(4*2)` and `"1/(4*2)"` both resolve to `"1/8"`. For dotted/triplet calculated rates, retain quotes: `"1/(4*2)."` or `"1/(4*2)t"`. Results must match one of the supported rates, not arbitrary fractions. Delay follows the current tempo and time signature's denominator beat: at tempo 120 in 4/4, `"1/8"` is 0.25 seconds; in 6/8 it is 0.5 seconds because tempo counts eighth-note beats. Tempo or meter changes re-sync the delay on the next bar.

Type inside `.effects(...)` to search by name, just like `.timbre(...)`: `.effects(r)` finds Reverb, with ↑/↓, Enter/Tab and Escape available. An empty argument shows nothing; no modal or separate search field appears. Selecting an effect inserts a usable parameter template. Existing numeric arguments, other effects, volume, timbre, rhythms and comments are preserved. Completion edits only the draft; Cmd/Ctrl + Enter applies it on the next bar.

Click an instrument row with valid effects to show its sliders below the code. Mix/feedback sliders use percentages, decay uses seconds, and cutoff uses a logarithmic frequency slider. Delay also has a note-length selector. Sliders rewrite only that effect in the source, so text remains authoritative. For the playing passage they automatically queue the new values for the next bar, preserving elapsed loops. Editing a different passage does not launch it or affect playback. If a passage launch is already queued, sliders leave that launch intact and only update the draft; re-evaluate after the launch to apply further edits. While stopped, a valid slider change prepares the editing passage for Play. Invalid passages are not overwritten by controls.

The signal path uses native [Web Audio nodes](https://www.w3.org/TR/webaudio/): a synthesized stereo convolution impulse for reverb, a tempo-synced delay with damped bounded feedback, and a non-resonant low-pass filter. Graph changes crossfade on the bar boundary; old reverb/delay tails can continue, but retired graphs fade out and are released within about 32 seconds. After four retained tails on one track, rapid edits fade the oldest tail early to bound processing cost. Unchanged graphs are reused, not recreated on every bar. Stop immediately disconnects all active and retired effect graphs, including feedback loops; Play starts fresh. These are built-in browser effects, not external DAW plug-ins.

## Saving and opening songs

The song name, complete source text and editing passage automatically save in this browser after 400 ms without an edit. Unfinished or invalid musical code is preserved too; saving a draft does not re-evaluate it. Refreshing restores the draft stopped, never auto-playing. Files do not contain audio or playback state.

Use **Export .ohcodes** or Cmd/Ctrl + S to download a portable project, and **Open** to read it back. The version-1 `.ohcodes` file is JSON containing the name, code, editing passage and save date, with `format: "ohcodes"`. Older `.ohsounds` files with `format: "ohsounds"` still open without changing their code or save metadata; future exports use the new name. Opening validates the file format, not whether the music is finished; a malformed or unsupported file leaves the current project and playback unchanged. Files are limited to 2 MB and source text to 250,000 characters.

Existing browser drafts and the previous-draft slot remain in the original `ohsounds.project.v1` / `ohsounds.project.previous.v1` storage keys. These are compatibility identifiers, not visible branding. Opening an unchanged old draft does not rewrite its stored bytes just to rename it. Normal edits save the new format; stale-tab and recovery safeguards still apply. The `/ohsounds` redirect stays on the same origin, so changing the path does not strand local drafts. Legacy `kit "ohsounds studio"` remains a supported alias for Studio.

**New song** starts with silent brackets. New/Open stop playback only when the replacement is confirmed. If the current song has not been exported, an inline confirmation offers export-and-replace, replace, or cancel. One previous replaced draft is retained for **Previous draft**, including edits still waiting for automatic saving. Replacing again updates that recovery slot; it is not a project library or unlimited undo history.

“Saved in this browser” means local browser storage, not cloud sync or a downloaded backup. Different browsers, devices and site origins have separate drafts—including the custom domain, native hosting URL and localhost. Clearing browser data can remove them; private browsing may retain them only for that session. Export before changing devices or clearing data. No login or cloud service is required.

If local storage fails, the app warns you and file export still works. A replaced draft can be recovered in memory until the page closes when storage is unavailable. An unreadable browser draft is not silently overwritten; its original text can be downloaded with **Export recovery copy**. If another tab changes the same browser draft, automatic saving pauses in this tab: export your edits before refreshing to load the other tab's saved version.

Imported samples, audio recording and audio export are not connected in this version. `.ohcodes` is the app's own source-project format, not an Ableton/Logic/Pro Tools session. This is a playable synthesized sound library and live-coding foundation, not a complete DAW.

## Development checks

```sh
npm run test:ohcodes
npx tsc --noEmit --incremental false
```
