export type ManualLanguage = 'en' | 'zh';
export type ManualText = Record<ManualLanguage, string>;
const t = (en: string, zh: string): ManualText => ({ en, zh });
export type ManualLesson = {
  id: string; title: ManualText; intro: ManualText;
  steps: { title: ManualText; body: ManualText }[];
  code?: string; hear?: ManualText; tryIt: ManualText; tip: ManualText;
};
const project = (body: string, meter = '4/4') => `tempo 120\ntime ${meter}\n\npassage"Verse"{\n${body}\n}`;
const sections = 'tempo 120\ntime 4/4\n\npassage"Verse"{\n  bd([1][][1][]).volume(-9)\n  sd([][1][][1]).volume(-12)\n  keys([C3maj]).volume(-12)\n}\n\npassage"Chorus"{\n  bd([1][1][1][1]).volume(-9)\n  hh([1 1][1 1][1 1][1 1]).volume(-15)\n  keys([F3maj][G3maj]).volume(-12)\n}';

export const MANUAL_LESSONS: ManualLesson[] = [
  {
    id: 'welcome', title: t('Start here', '从这里开始'),
    intro: t('Make music by writing what each instrument plays. You do not need programming experience. Start with silence, then add your own ideas.', '用代码写出每件乐器演奏什么。你不需要编程基础：先从安静的空拍开始，再填入自己的音乐。'),
    steps: [
      { title: t('Meet your workspace', '认识界面'), body: t('Studio is where you write and play. The large editor is your music; Passages holds sections such as Verse and Chorus. Live repeats a passage. Song follows an arrangement.', 'Studio 是写作和播放的地方。大编辑区就是你的音乐；Passages 放主歌、副歌等段落。Live 循环演奏段落，Song 按编排顺序播放。') },
      { title: t('Begin with an empty song', '从空白歌曲开始'), body: t('In Studio, choose New song. If you already have work, export it before replacing it. Empty [] brackets are intentionally silent. Play will be silent until you add a hit or note.', '回到 Studio，点击 New song。如果已有作品，先导出再替换。空的 [] 本来就没有声音；在填入触发或音符之前，按 Play 仍然安静是正常的。') },
      { title: t('Know the three controls', '认识三个操作'), body: t('Play starts the selected passage in Live mode. Re-evaluate prepares edits while stopped, or applies them at the next bar while playing. The square Stop button stops sound and resets the position.', 'Live 模式下，Play 开始播放选中的段落。Re-evaluate 在停止时准备代码，在播放时让修改于下一小节生效。方形 Stop 按钮停止声音并重置位置。') },
    ],
    code: 'tempo 120\ntime 4/4\n\npassage"Passage 1"{\n  bd([][][][])\n}',
    hear: t('Silence. Each empty bracket is a place for a drum beat you have not written yet.', '没有声音。每个空括号都是你还没有填入的一个鼓拍。'),
    tryIt: t('Return to Studio and find tempo, time, passage and bd in the starter code. Then continue to Your first sound.', '回到 Studio，在起始代码里找到 tempo、time、passage 和 bd，再进入下一课「第一个声音」。'),
    tip: t('Manual never replaces your code or plays an example automatically. Music already playing keeps going while you read. The top transport always controls your Studio project.', 'Manual 不会替换代码或自动播放示例。阅读时，已经播放的音乐会继续；顶部播放控制始终控制你的 Studio 工程。'),
  },
  {
    id: 'first-sound', title: t('Your first sound', '第一个声音'),
    intro: t('One instrument, one hit, one repeating bar. This is the smallest useful piece of ohcodes.', '一件乐器、一次触发、一个循环小节。这就是最简单的 ohcodes 音乐。'),
    steps: [
      { title: t('Put 1 inside a bracket', '在括号里填入 1'), body: t('bd means bass drum (kick). Change bd([][][][]) to bd([1][][][]). A 1 triggers the sound; an empty [] stays silent.', 'bd 是底鼓（kick）。把 bd([][][][]) 改成 bd([1][][][])。1 表示触发声音，空的 [] 保持安静。') },
      { title: t('Read the wrapper', '读懂外层代码'), body: t('tempo 120 sets 120 beats per minute. time 4/4 gives four quarter-note beats per bar. passage"Verse"{ ... } names a section; its instrument lines go between { and }.', 'tempo 120 表示每分钟 120 拍。time 4/4 表示每小节四个四分音符拍。passage"Verse"{ ... } 给段落起名；乐器代码写在 { 和 } 之间。') },
      { title: t('Play, then edit live', '开始播放，再实时修改'), body: t('Select Live and press Play. Add a second 1 in the third bracket, then press Cmd+Enter on Mac or Ctrl+Enter on Windows. The new rhythm enters at the next bar without starting from zero.', '选择 Live，按 Play。在第三个括号里再加一个 1，然后按 Mac 的 Cmd+Enter，或 Windows 的 Ctrl+Enter。新节奏从下一小节生效，不会回到开头。') },
    ],
    code: project('  bd([1][][][]).volume(-9)'),
    hear: t('A kick on beat 1, then three silent beats. At tempo 120 in 4/4, it repeats every two seconds.', '第一拍一个底鼓，后面三拍安静。在 120 的 4/4 拍里，每两秒循环一次。'),
    tryIt: t('Make bd([1][][1][]), then try bd([][1][][1]). Re-evaluate after each change and listen to where the kick moves.', '先写 bd([1][][1][])，再试 bd([][1][][1])。每次修改后重新运行，听底鼓的位置如何变化。'),
    tip: t('The example uses .volume(-9) to turn this instrument down by 9 dB. Keep your listening volume comfortable. Re-evaluate alone does not start playback when stopped; press Play.', '示例的 .volume(-9) 将这件乐器降低 9 dB。使用舒适的监听音量。停止时只按 Re-evaluate 不会开始播放，还需要按 Play。'),
  },
  {
    id: 'drums', title: t('Build a drum groove', '写一个鼓律动'),
    intro: t('Give each drum its own line. All lines in a passage play together.', '每个鼓件各写一行。同一段落里的所有乐器会一起演奏。'),
    steps: [
      { title: t('Add a snare and hats', '加入军鼓和踩镲'), body: t('sd is snare, hh is closed hi-hat. Write sd([][1][][1]) for a snare on beats 2 and 4. Write hh([1][1][1][1]) for a hat on every beat.', 'sd 是军鼓，hh 是闭镲。sd([][1][][1]) 在第 2、4 拍打军鼓；hh([1][1][1][1]) 每拍打一次闭镲。') },
      { title: t('Use the inline suggestions', '使用行内补全'), body: t('On an empty line inside a passage, type bd, sd or hh, then press Tab for a silent row. Its brackets follow the passage meter. Add instrument also inserts an empty row. You write the rhythm yourself.', '在段落内部的空行输入 bd、sd 或 hh，再按 Tab 插入静音行。括号数跟随本段拍号。Add instrument 也可以添加空行，节奏由你自己填写。') },
      { title: t('Choose text or Steps', '选择文字或 Steps 辅助'), body: t('The steps button beside a drum line opens a grid that edits the same code. For a full empty kit, write ins.drums on its own line in a passage without drum rows, then Re-evaluate.', '鼓行旁的 steps 按钮打开网格，它修改的仍是同一份代码。想添加整套空鼓，在没有鼓行的段落里单独写一行 ins.drums，再 Re-evaluate。') },
    ],
    code: project('  bd([1][][1][]).volume(-9)\n  sd([][1][][1]).volume(-12)\n  hh([1][1][1][1]).volume(-15)'),
    hear: t('Kick on 1 and 3, snare on 2 and 4, with four steady hats over the bar.', '底鼓在 1、3 拍，军鼓在 2、4 拍，四个均匀闭镲贯穿小节。'),
    tryIt: t('Move one snare hit or remove one hat. Apply it while the loop is playing.', '移动一次军鼓，或去掉一次闭镲，在循环播放时应用修改。'),
    tip: t('Drums: bd kick, sd snare, hh closed hat, oh open hat, cym crash, rd ride, rim rim hit, t1/t2/t3 high/mid/low tom, ft floor tom. Use one bracket-pattern row per part in a passage.', '鼓件：bd 底鼓、sd 军鼓、hh 闭镲、oh 开镲、cym 碎音镲、rd 叮叮镲、rim 鼓边、t1/t2/t3 高／中／低嗵鼓、ft 落地嗵鼓。同一段落中，每个鼓件只写一行括号节奏。'),
  },
  {
    id: 'subdivision', title: t('Rests & subdivisions', '空拍与细分'),
    intro: t('For drums, one [] is one beat. What you put inside divides that beat into smaller, equal parts.', '鼓的一个 [] 就是一拍。括号内的内容将这一拍平均分成更小的部分。'),
    steps: [
      { title: t('Use ordinary spaces', '使用普通空格'), body: t('In 4/4, [1 1] gives two eighth-note hits. [1 1 1 1] gives four sixteenths. [1 1 1] gives an eighth-note triplet: three equal hits inside one quarter-note beat.', '4/4 中，[1 1] 是两个八分音符，[1 1 1 1] 是四个十六分音符，[1 1 1] 是八分音符三连音：把一个四分音符拍平均分成三份。') },
      { title: t('Leave room for silence', '让节奏留出空白'), body: t('~ means rest. [~ 1] is an eighth rest followed by an eighth-note hit. 0 also means rest: [1000] is four sixteenth-note slots with only the first triggered. Spaces between 0 and 1 are optional.', '~ 是休止。[~ 1] 表示前一个八分音符休止，后一个触发。0 也表示休止：[1000] 是四个十六分音符位置，只有第一个发声。0 和 1 之间可以加普通空格。') },
      { title: t('Mix subdivisions', '混合细分方式'), body: t('Each beat can divide differently. [1][1 1][1 1 1][1 1 1 1] moves from a single hit to two, three and four within the same bar.', '每拍可以采用不同细分。[1][1 1][1 1 1][1 1 1 1] 在同一小节里依次从一次触发变成两次、三次、四次。') },
    ],
    code: project('  bd([1][][1][]).volume(-9)\n  hh([1][1 1][1 1 1][~ 1 ~ 1]).volume(-15)'),
    hear: t('A steady kick underneath hats that become denser, then play two offbeat sixteenths on the last beat.', '底鼓保持稳定，闭镲先越来越密，最后一拍落在第二、第四个十六分音符位置。'),
    tryIt: t('Change the last hat beat to [1001]. It still has four slots; only their trigger positions changed.', '将最后一拍闭镲改成 [1001]。它仍有四个位置，只是触发位置变了。'),
    tip: t('Alternative drum text: hh("x*8") makes eight equally spaced hits across a bar. x is a hit, ~ a rest. Here * repeats; in melodic brackets, * instead sets relative duration.', '鼓还支持另一种文字写法：hh("x*8") 在整个小节平均触发八次。x 是触发，~ 是休止。这里的 * 表示重复；旋律括号里的 * 则表示相对时值。'),
  },
  {
    id: 'meter', title: t('Meters & longer loops', '拍号与多小节循环'),
    intro: t('Change the size of a bar, then give a track a longer phrase with commas.', '改变小节的拍数，再用逗号为一件乐器写更长的乐句。'),
    steps: [
      { title: t('Match drum brackets to the meter', '鼓括号数量跟随拍号'), body: t('time 3/4 needs three drum brackets per bar; time 6/8 needs six. The lower number sets the beat unit. In 6/8, tempo 120 means 120 eighth-note beats per minute.', 'time 3/4 每小节需要三个鼓括号，time 6/8 需要六个。分母决定一拍的单位。6/8 中 tempo 120 表示每分钟 120 个八分音符拍。') },
      { title: t('A comma starts another bar', '逗号开始下一小节'), body: t('Write up to four bars per instrument, separated by commas. Without a comma, its one bar repeats. A two-bar kick and one-bar snare loop independently.', '每件乐器最多写四小节，用逗号分隔。不加逗号时，就重复一个小节。两小节的底鼓和一小节的军鼓会各自循环。') },
      { title: t('Use a local meter', '设置段落拍号'), body: t('tempo and time above passages are global defaults. Put them inside a passage to override them for that section. A meter change does not rewrite existing drum brackets; adjust their count yourself.', '段落外的 tempo 和 time 是全局默认值，也可以写在段落内部，让该段单独使用它们。改拍号不会重写已有鼓括号，需要自己调整数量。') },
    ],
    code: project('  bd([1][][][1][][], [1][][][1][][~ 1]).volume(-9)\n  hh([1][1][1][1][1][1]).volume(-15)', '6/8'),
    hear: t('Six steady hats per bar. The kick repeats a two-bar phrase, adding a hit at the end of every second bar.', '每小节六次均匀闭镲。底鼓演奏两小节乐句，每第二小节结尾多一次触发。'),
    tryIt: t('Remove the final [~ 1] kick by changing it to []. Listen for the simpler two-bar phrase.', '把底鼓最后的 [~ 1] 改成 []，听两小节乐句如何变简单。'),
    tip: t('Meters support 1–16 beats and a denominator of 2, 4, 8 or 16. There is no automatic dotted-quarter tempo unit in 6/8: it still counts eighth notes.', '拍号支持每小节 1–16 拍，分母可为 2、4、8、16。6/8 不会自动改用附点四分音符计算速度，tempo 仍按八分音符计算。'),
  },
  {
    id: 'notes', title: t('Notes, chords & duration', '音符、和弦与时值'),
    intro: t('Melodic instruments use the same brackets, with one important difference: their groups divide the whole bar.', '旋律乐器也用括号，但有一个重要区别：它的括号组平均分配整个小节。'),
    steps: [
      { title: t('Name a pitch', '写出音高'), body: t('Use C3, F#3 or Bb3. The number is the octave; an omitted number defaults to octave 4. Melodic rows are bass, keys, piano, synth, pad, pluck and guitar.', '使用 C3、F#3 或 Bb3。数字是八度，省略数字时默认第 4 八度。旋律行包括 bass、keys、piano、synth、pad、pluck 和 guitar。') },
      { title: t('Choose the duration', '决定持续多久'), body: t('In 4/4, keys([C3]) lasts four beats; keys([C3][G3]) gives two beats each; keys([C3][][][]) sounds for one beat, then rests for three. Empty [] never extends the previous note.', '4/4 中，keys([C3]) 持续四拍；keys([C3][G3]) 每个音两拍；keys([C3][][][]) 响一拍，后面休止三拍。空 [] 不会延长前面的音。') },
      { title: t('Stack or divide notes', '同时弹和弦，或细分音符'), body: t('C3&E3&G3 plays a chord together; C3maj names the same chord. Spaces play notes in sequence. [C4*3 G4] gives C three shares and G one share of its group. A lone [C4*4] is no longer than [C4].', 'C3&E3&G3 同时演奏和弦，C3maj 是同一个和弦的名称。空格表示依次演奏。[C4*3 G4] 把本组的三份时间给 C，一份给 G。单独的 [C4*4] 并不比 [C4] 更长。') },
    ],
    code: project('  bass([C2][G2]).volume(-12)\n  keys([C3&E3&G3]).volume(-12)\n  synth([C4 D4 E4][][][G4*3 E4]).volume(-18)'),
    hear: t('Bass changes halfway through the bar. A C major chord occupies the whole bar. The synth plays a triplet in beat 1, rests for beats 2–3, then plays a long G and short E inside beat 4.', '贝斯在小节中间换音，C 大三和弦占满整小节。合成器第一拍弹三连音，第 2、3 拍休止，第 4 拍内弹较长的 G 和较短的 E。'),
    tryIt: t('Change keys([C3&E3&G3]) to keys([C3maj][F3maj]). Each chord now receives two beats.', '把 keys([C3&E3&G3]) 改为 keys([C3maj][F3maj])，两个和弦现在各占两拍。'),
    tip: t('Chords: maj, min/m, maj7, min7/m7, dom7, dim, sus2, sus4. C7 is a note in octave 7; Cdom7 is a dominant chord. The next note on an instrument replaces its previous voice. Natural releases can ring into a rest.', '和弦：maj、min/m、maj7、min7/m7、dom7、dim、sus2、sus4。C7 是第 7 八度的音，Cdom7 才是属七和弦。同一乐器的后一个音会替代前一个声音；自然衰减可能响进休止部分。'),
  },
  {
    id: 'tracks', title: t('Name your tracks', '命名音轨与叠加声部'),
    intro: t('Use name = instrument(...) to give every musical role its own track, even when several tracks use the same instrument.', '用 名称 = 乐器(...) 为每个音乐角色建立独立音轨。同一个段落可以有多条 keys，也可以叠加两条底鼓。'),
    steps: [
      { title: t('Name the role, then write the instrument', '先起名字，再写乐器'), body: t('chords = keys([C3&E3&G3]) makes a track named chords. melody = keys([C4][E4][G4][E4]) makes another keys track. Each keeps its own notes, loops, timbre, volume, effects, velocity and swing. A new melody note will not cut off the chord track.', 'chords = keys([C3&E3&G3]) 建立名为 chords 的音轨；melody = keys([C4][E4][G4][E4]) 建立另一条 keys 音轨。音符、循环长度、音色、音量、效果、velocity 和 swing 都各自独立。旋律的新音符不会截断和弦轨。') },
      { title: t('Use the same editor tools', '继续使用原来的编辑工具'), body: t('Type chords = ke and press Tab for a silent keys template. All existing .scale(), .timbre() and .effects() searches work after named instruments. Steps and effect sliders display the track name and edit only that row. Re-evaluate applies changes at the next bar.', '输入 chords = ke，再按 Tab 可插入空的 keys 模板。命名后仍可使用 .scale()、.timbre()、.effects() 搜索。Steps 和效果滑杆显示音轨名，只改对应的一行。Re-evaluate 让修改在下一小节生效。') },
      { title: t('Keep names simple and local', '名称简短，段落内不重复'), body: t('Use 1–48 English letters, digits or underscores, starting with a letter or underscore: chords, melody2, kick_low. Names are case-sensitive and unique within a passage, even across different instrument types. Another passage may use the same name. Up to 64 instrument rows fit in one passage.', '名称使用 1–48 个英文字母、数字或下划线，以字母或下划线开头，例如 chords、melody2、kick_low。区分大小写；同一段落内不能重名，即使乐器不同。其他段落可以使用同一个名字。每段最多 64 行乐器。') },
    ],
    code: project('  chords = keys([C3&E3&G3]).timbre("electric-piano").volume(-15)\n  melody = keys([C4][E4][G4][E4]).timbre("piano").volume(-12)\n  kick = bd([1][][1][]).volume(-12)'),
    hear: t('A sustained C major chord continues underneath a four-note piano melody, with a kick on beats 1 and 3. The two keys tracks sound together rather than replacing each other.', 'C 大三和弦持续整小节，上方有四个钢琴旋律音；第一、三拍有底鼓。两条 keys 会叠加发声，不会互相替换。'),
    tryIt: t('Turn only chords down to .volume(-24), then re-evaluate. The melody should keep its level. Add kick_high = bd([1][][1][]).timbre("909").volume(-18) to layer a second kick.', '只把 chords 改成 .volume(-24)，再重新运行；melody 的音量不变。加一行 kick_high = bd([1][][1][]).timbre("909").volume(-18)，试着叠加第二个底鼓。'),
    tip: t('Naming is optional: keys(...) and bd(...) still work. A named keys track can coexist with an unnamed keys row. = defines a track, not a general variable: melody = chords is not supported. The same name in another passage is a separate definition, not a shared pattern. Naming or renaming never applies audio until re-evaluation.', '命名是可选的：keys(...)、bd(...) 仍能用；命名 keys 也可与无名称 keys 共存。= 只定义音轨，不是通用变量，因此不支持 melody = chords。其他段落的同名轨是单独定义，不是共享 pattern。命名或改名都需要重新运行才影响声音。'),
  },
  {
    id: 'mute-solo', title: t('Mute & solo', '选择播放的音轨'),
    intro: t('Keep all your patterns in the passage. Choose which tracks you hear with one line below the instruments.', '保留段落里的所有 pattern，在乐器下面写一行，就能选择听哪些音轨。'),
    steps: [
      { title: t('Mute a part, or solo a few', '静音一些声部，或只听几条音轨'), body: t('mute(chords) silences chords. solo(melody, kick) plays only melody and kick. Write each command on its own line inside the passage, not after its closing brace. Names are case-sensitive and need no quotes. Unnamed rows use their instrument name: mute(bd, hh).', 'mute(chords) 静音 chords；solo(melody, kick) 只播放 melody 和 kick。指令单独占一行，写在 passage 的大括号里面，不是结束括号外面。名称区分大小写，不加引号。未命名的行使用乐器名，例如 mute(bd, hh)。') },
      { title: t('Choose from this passage', '直接选择当前段落里的音轨'), body: t('Type inside mute() or solo() to see matching track names below the caret. ↑/↓ chooses, Tab/Enter inserts. Separate multiple names with commas. An unknown or ambiguous name reports an error and keeps the last valid music playing.', '在 mute() 或 solo() 的括号里输入，会在光标下提示当前段落的音轨名。↑/↓ 选择，Tab/Enter 插入；多个名字用逗号隔开。写错名字或名字有歧义时会报错，上一次有效播放不受影响。') },
      { title: t('Apply or clear without restarting', '不中断循环地应用或取消'), body: t('Cmd/Ctrl+Enter applies on the next bar, keeping the elapsed loop and velocity phase. Each passage has its own selection. Use at most one mute line and one solo line: solo selects first, then mute removes. Empty () or deleting a line clears that filter; clear both for all tracks.', 'Cmd/Ctrl+Enter 在下一小节应用，保留循环位置和力度序列进度。每个 passage 独立设置。最多各写一行 mute 和 solo：solo 先选，mute 再排除。空 () 或删除该行取消对应筛选；两者都取消就恢复全部音轨。') },
    ],
    code: project('  chords = keys([C3&E3&G3]).volume(-15)\n  melody = keys([C4][E4][G4][E4]).volume(-12)\n  kick = bd([1][][1][]).volume(-12)\n\n  solo(melody, kick)'),
    hear: t('Only the four-note melody and kick play. The sustained chord remains in the code but is silent.', '只听到四个旋律音和底鼓。持续和弦还保留在代码里，但暂时不发声。'),
    tryIt: t('Change solo(melody, kick) to solo(melody), then re-evaluate. Change it to solo() and re-evaluate to bring every track back. Try mute(chords) instead.', '将 solo(melody, kick) 改为 solo(melody) 并重新运行；再改成 solo() 并重新运行，恢复全部音轨。也可以改用 mute(chords)。'),
    tip: t('Mute gates the whole track after effects, including reverb and delay, with a 20 ms fade. Effects keep evolving silently, so an old tail may remain when unmuted. Muted patterns still need valid code and count toward resource limits. Their loops keep their place.', '静音在效果链之后进行，混响和延迟也一起静音，并有 20 毫秒淡变避免杂音。效果仍在静音中自然衰减，所以取消静音时可能听到未消失的尾音。静音轨仍需语法正确，也计入资源限制；循环位置继续推进。'),
  },
  {
    id: 'scales', title: t('Scales & degrees', '音阶与级数'),
    intro: t('Write a melody with numbers, then choose its key and register after the instrument. No global scale or passage-level scale is needed.', '用数字写旋律，在乐器后面选择调性和音区。scale 只属于当前乐器，不放在全局或 passage 前面。'),
    steps: [
      { title: t('Put the scale after the instrument', '把音阶放在乐器后面'), body: t('keys([1&3&5]).scale("C3 major") plays C3, E3 and G3. bass([1][8]).scale("C1 minor") plays C1 then C2. The root must include its octave; lowercase c1 also works. 0, ~ and empty brackets remain rests; drums keep 0/1 triggers.', 'keys([1&3&5]).scale("C3 major") 演奏 C3、E3、G3。bass([1][8]).scale("C1 minor") 演奏 C1 和 C2。根音必须带八度，c1 小写也可以。0、~ 和空括号仍是休止；鼓保持 0/1 触发。') },
      { title: t('Choose a mode without rewriting the melody', '不改旋律数字，切换调式'), body: t('Use major/ionian, minor/aeolian, dorian, phrygian, lydian, mixolydian or locrian. Numbers follow the selected scale: C3 minor makes 3 = Eb3. Type .sc and Tab to insert .scale(""); type C3 m inside it to search. ↑/↓ chooses; Tab/Enter completes; Cmd/Ctrl+Enter applies.', '可选 major/ionian、minor/aeolian、dorian、phrygian、lydian、mixolydian、locrian。数字跟随所选音阶，例如 C3 minor 的 3 是 Eb3。输入 .sc 后按 Tab 插入 .scale("")，在里面输入 C3 m 搜索。↑/↓ 选择，Tab/Enter 补全，Cmd/Ctrl+Enter 应用。') },
      { title: t('Use sharps and flats in chromatic', 'chromatic 用升降级数'), body: t('Chromatic keeps major-scale degree positions: 1 #1 2 #2 3 4 #4 5 #5 6 #6 7 8 ascends by semitones; 8 7 b7 6 b6 5 b5 4 3 b3 2 b2 1 descends. It does not number semitones 1–12. In every mode, 8 is the next-octave root; 15 is two octaves above. Prefix #/b degrees are a chromatic feature.', 'chromatic 以大调级数位置为参照：1 #1 2 #2 3 4 #4 5 #5 6 #6 7 8 按半音上行；8 7 b7 6 b6 5 b5 4 3 b3 2 b2 1 按半音下行。不是把半音编号为 1–12。所有调式中，8 都是高八度的根音，15 高两个八度。级数前的 #/b 是 chromatic 专用写法。') },
    ],
    code: project('  keys([1&3&5]).scale("C3 minor").volume(-15)\n  bass([1][8]).scale("C1 minor").volume(-12)\n  synth([1 #1 2 #2][3 4 #4 5][#5 6 #6 7][8 7 b7 6]).scale("C4 chromatic").timbre("sine").volume(-18)'),
    hear: t('A C minor chord lasts a bar; bass moves from C1 to C2 halfway through. The synth rises in semitones from C4 to C5, then descends through B4, Bb4 and A4.', 'C 小三和弦持续整小节；贝斯在半小节处从 C1 升到 C2。合成器从 C4 按半音升至 C5，再经过 B4、Bb4、A4 下行。'),
    tryIt: t('Change only keys from C3 minor to C3 major, then re-evaluate: its middle note changes Eb3 to E3. Keep the bass and synth untouched. Try D4 dorian on a separate numeric melody.', '只把 keys 的 C3 minor 改成 C3 major，再重新运行：和弦中间的 Eb3 变成 E3。贝斯和合成器保持原样。也可以用单独的数字旋律试 D4 dorian。'),
    tip: t('Named pitches are not forced into the scale. In chromatic only, lowercase b3 means flat third, so write uppercase B3 for the B note (Bb3 still means B-flat). Use spaces between degrees: [1 3] is two notes; [13] is the thirteenth degree. * still controls duration. Out-of-range or unfinished code keeps the last valid music playing.', '明确音名不会被强制吸附到音阶。仅在 chromatic 中，小写 b3 表示降三级，所以 B 音请写大写 B3（Bb3 仍是降 B）。级数之间要有空格：[1 3] 是两个音，[13] 是第十三级。* 仍控制时值。超范围或未完成的代码不会打断上一次有效播放。'),
  },
  {
    id: 'timbres', title: t('Choose your sounds', '选择音色'),
    intro: t('The instrument line says what to play. .timbre() chooses what it sounds like.', '乐器行决定演奏什么，.timbre() 决定用什么音色。'),
    steps: [
      { title: t('Search inside the parentheses', '在括号里搜索'), body: t('After a complete pattern, type .timbre(s). As you type s, compatible sounds containing s appear below the caret. Choose with ↑/↓ and Enter/Tab. Completion adds the quotes for you.', '在完整节奏后输入 .timbre(s)。输入 s 时，光标下会出现名称含 s 的兼容音色。用 ↑/↓ 选择，Enter/Tab 确认，补全会自动加上引号。') },
      { title: t('Apply the sound change', '应用音色变化'), body: t('The finished syntax is .timbre("studio") or .timbre("electric-piano"). Selecting a suggestion only edits code. Re-evaluate to hear it at the next bar while playing.', '完成后的写法是 .timbre("studio") 或 .timbre("electric-piano")。选择提示只修改代码；播放中需要 Re-evaluate，才能在下一小节听到新音色。') },
      { title: t('Use compatible families', '使用兼容的音色类型'), body: t('Any melodic row can use any melodic preset: bass can even use a piano sound. Drum rows require a drum kit. Empty .timbre() shows no list; type part of a name first.', '任意旋律行都能使用任意旋律预设，例如 bass 也能用钢琴。鼓行必须使用鼓组。空的 .timbre() 不会显示列表，先输入名称的一部分。') },
    ],
    code: project('  bd([1][][1][]).timbre("808").volume(-12)\n  bass([C2][G2]).timbre("round-bass").volume(-12)\n  keys([C3maj][F3maj]).timbre("electric-piano").volume(-12)'),
    hear: t('An electronic kick, rounded bass and soft electric-piano chords, playing the notes and rhythm you wrote.', '电子底鼓、圆润贝斯和柔和的电钢琴和弦，演奏的音符和节奏仍由代码决定。'),
    tryIt: t('Change electric-piano to organ, then Re-evaluate. Keep the notes identical and compare the sound.', '将 electric-piano 改为 organ，再 Re-evaluate。保持音符不变，比较音色。'),
    tip: t('All sounds are built-in browser synthesis. Piano, strings and guitar are synthesized approximations, not recorded instruments. Importing samples or loading Kontakt is not available yet.', '所有音色都是内置浏览器合成。钢琴、弦乐和吉他是合成近似音色，并非真实乐器录音。目前还不能导入采样或加载 Kontakt。'),
  },
  {
    id: 'mix', title: t('Groove, volume & effects', '律动、音量与效果'),
    intro: t('Shape a part with small additions after its pattern. Each setting belongs to that instrument.', '在节奏后添加简短设置来塑造声音。每个设置只属于这一件乐器。'),
    steps: [
      { title: t('Balance and accent', '平衡音量，加入重音'), body: t('.volume(-6) lowers the whole instrument by 6 dB; 0 is unchanged, with a range of −60 to +6. .velocity(90, 45) alternates strong and soft hits. Use 1–127; rests do not advance the sequence, and a chord uses one value.', '.volume(-6) 将整件乐器降低 6 dB；0 不变，范围 −60 到 +6。.velocity(90, 45) 交替演奏强弱触发。数值是 1–127；休止不消耗数值，一个和弦共用一个数值。') },
      { title: t('Add swing', '加入摇摆'), body: t('.swing(60) divides a beat 60:40 instead of 50:50. Use 50–75; 50 is straight. It affects straight subdivisions, not triplets or * weighted notes. Type .v or .s to find these modifiers.', '.swing(60) 把一拍从 50:50 改为 60:40。范围 50–75，50 为平直。它影响平直细分，不改变三连音或带 * 权重的音符。输入 .v 或 .s 可以找到这些设置。') },
      { title: t('Search for an effect', '搜索效果'), body: t('Type .effects(r) to find Reverb. Effects run left to right. Reverb uses mix % and decay seconds; Delay uses mix %, quoted note length and feedback %; Filter is a low-pass cutoff in Hz. Hints show the ranges.', '输入 .effects(r) 搜索 Reverb。效果从左到右处理。Reverb 使用混合百分比和衰减秒数；Delay 使用混合百分比、带引号的音符时长和反馈百分比；Filter 是低通截止频率，单位 Hz。行内帮助显示范围。') },
    ],
    code: project('  hh([1 1][1 1][1 1][1 1]).velocity(90, 45).swing(60).volume(-12)\n  keys([C3maj]).volume(-12).effects("reverb", 25, 2)\n  pluck([C4][][][]).volume(-15).effects("delay", 20, "1/8", 35)'),
    hear: t('Alternating strong/soft swung hats, a chord with a reverb tail, and a pluck with quiet eighth-note echoes.', '强弱交替、带摇摆的闭镲，带混响尾音的和弦，以及带轻微八分音符回声的拨弦。'),
    tryIt: t('Set swing to 50, then 65. Click the keys line to show its effect sliders and change the reverb mix.', '把 swing 先设为 50，再设为 65。点击 keys 行，显示效果滑块，调整混响比例。'),
    tip: t('Text edits need Re-evaluate. Effect sliders write the same code and apply at the next bar for the playing passage; another passage stays a draft. Use each effect once per instrument. Stop clears effect tails.', '文字修改需要 Re-evaluate。效果滑块写回同一份代码，并在当前播放段落的下一小节生效；其他段落仍保持草稿。每件乐器的每种效果最多一次。Stop 清除效果尾音。'),
  },
  {
    id: 'computation', title: t('Calculate & repeat', '计算与重复'),
    intro: t('Write how a musical value is made, not only its final number. Start with ordinary arithmetic and repeated bracket groups.', '不只写最终数字，也写出这个音乐数值如何得到。从普通算术和括号重复开始。'),
    steps: [
      { title: t('Calculate a value', '用算式写参数'), body: t('Use +, -, * and / with parentheses. tempo 60*2 means 120; .velocity(10*8) means 80; .volume(-3*4) means −12 dB. Multiplication and division come before addition and subtraction; (10+5)*2 gives 30. Multiplication uses one *, not **.', '支持 +、-、*、/ 和小括号。tempo 60*2 是 120，.velocity(10*8) 是 80，.volume(-3*4) 是 −12 dB。先乘除后加减；(10+5)*2 等于 30。乘法用一个 *，不是 **。') },
      { title: t('Repeat a bracket group', '重复一个括号组'), body: t('bd([]*4) is four silent beats. hh([1 0]*(2+2)) repeats that beat four times. Drums still need one expanded group per beat. For melody, keys([C3]*4) divides one bar into four C notes; keys([C3]) is one long C. A comma still starts a new bar, with up to four written bars.', 'bd([]*4) 是四个空拍。hh([1 0]*(2+2)) 把这一拍重复四次。鼓展开后仍需每拍一个括号。旋律的 keys([C3]*4) 把一小节分成四个 C；keys([C3]) 则是一个长 C。逗号仍表示下一小节，最多写四小节。') },
      { title: t('Keep musical notation clear', '让音乐含义保持清楚'), body: t('C3*2 still gives a note twice the time weight; C3*(1+1) is the same. Put computed degrees inside parentheses: keys([(1+2) (8/2)]).scale("C3 major") plays degrees 3 then 4. In drum groups, [(2-1) (8/8)] is two triggers; each result must be 0 or 1. Keep an expression together inside parentheses when it contains spaces.', 'C3*2 仍表示该音符占两份时间，C3*(1+1) 与它相同。计算级数时加小括号：keys([(1+2) (8/2)]).scale("C3 major") 依次弹第 3、4 级。鼓的 [(2-1) (8/8)] 是两次触发；每项结果必须为 0 或 1。算式里有空格时，用小括号把它包成一个内容。') },
    ],
    code: 'tempo 60*2\ntime 4/4\n\npassage"Verse"{\n  bd([1][][1][]).volume(-3*3)\n  hh([1 0]*(2+2)).velocity(10*8,10*4).volume(-3*5)\n  keys([(1+2) (8/2)]).scale("C(1+2) major").volume(-3*4).effects("reverb",10+15,1+1)\n}',
    hear: t('At tempo 120, kick on beats 1 and 3, four hats alternating velocity 80 and 40, and E3 then F3 for two beats each with reverb.', '速度 120，底鼓在第 1、3 拍；四次闭镲以 80、40 的力度交替；E3、F3 各占两拍，并带混响。'),
    tryIt: t('Change hat velocity 10*8 to 10*10 and reverb mix 10+15 to 10+30, then Re-evaluate. Try bd([]*4) separately to confirm repetition can stay completely silent.', '把闭镲力度 10*8 改为 10*10，混响比例 10+15 改为 10+30，再重新运行。另试 bd([]*4)，确认重复也可以完全静音。'),
    tip: t('Arithmetic also works in effect parameters, note/root octaves, meter numbers and Song bar counts. time (3+3)/(2*4) is 6/8; a Song line "Verse" 2*4 lasts eight bars. Results must stay in each parameter’s range; division by zero is an error. Formulas are calculated when applied, not evolving automation. Variables and random/Euclidean generators are not included yet. Editing a repeated rhythm in Steps expands that row to explicit groups; an effect slider replaces only its changed parameter with a number, leaving other formulas intact.', '效果参数、音符／根音八度、拍号数字和 Song 小节数也能计算。time (3+3)/(2*4) 是 6/8；Song 的 "Verse" 2*4 是八小节。结果仍需在参数范围内，除以零会报错。算式在应用时求值，不是自动随时间变化的 automation。暂不包含变量、随机或欧几里得节奏生成器。用 Steps 修改重复节奏时，该行会展开为明确的括号；效果滑杆只把改动的参数换成数值，保留其他算式。'),
  },
  {
    id: 'passages', title: t('Perform with passages', '用段落进行表演'),
    intro: t('Give musical sections names, then launch them when you want the music to change.', '给音乐段落起名，在你希望音乐变化的时候启动它们。'),
    steps: [
      { title: t('Make another section', '创建另一段'), body: t('Add passage"Chorus"{ ... } below Verse, or use + New / Duplicate in Passages. Keep names unique. The example below is a complete two-section project.', '在 Verse 后添加 passage"Chorus"{ ... }，或使用 Passages 的 + New／Duplicate。各段名称不能重复。下面是完整的两段工程。') },
      { title: t('Editing is not launching', '区分编辑和启动'), body: t('Click a passage name to edit without changing the music. Click its ▶ arrow to launch it. During playback, it enters at the next bar; its instruments start at their first bar while the main counter continues.', '点击段落名称只切换编辑对象，不改变音乐。点击该段的 ▶ 才会启动它。播放中，新段在下一小节进入，其乐器从第一小节开始，主计数器继续前进。') },
      { title: t('Use the keyboard in Studio', '在 Studio 使用快捷键'), body: t('Cmd/Ctrl+Shift+1–9 launches the first nine passages. Cmd/Ctrl+Enter applies the editing passage: it keeps loop position if that passage is already playing, or queues a switch if you are editing another one.', 'Cmd/Ctrl+Shift+1–9 按顺序启动前九个段落。Cmd/Ctrl+Enter 应用正在编辑的段落：若它正在播放，会保留循环位置；若编辑的是另一段，则排队切换到那一段。') },
    ],
    code: sections,
    hear: t('Verse has a kick/snare backbeat and one held chord. Chorus adds four-on-the-floor kicks, eighth-note hats and two chords per bar.', 'Verse 是底鼓、军鼓的基本节奏和一个持续和弦。Chorus 是每拍底鼓、八分音符闭镲，以及每小节两个和弦。'),
    tryIt: t('Play Verse in Live mode. Edit Chorus while Verse plays, then launch Chorus. Cancel can withdraw a queued change before the scheduler commits it.', '在 Live 模式播放 Verse。让 Verse 继续播放，同时修改 Chorus，再启动 Chorus。排队切换提交之前，可以用 Cancel 撤销。'),
    tip: t('Invalid edits keep the last valid music playing. Studio/Manual changes only the view, not the playing passage. Re-evaluate and passage-launch shortcuts are active in Studio.', '无效修改会保留上一版有效音乐。Studio／Manual 只切换视图，不改变正在演奏的段落。重新运行和段落启动快捷键在 Studio 内使用。'),
  },
  {
    id: 'song', title: t('Arrange a whole song', '编排完整歌曲'),
    intro: t('Live is for choosing sections yourself. Song plays your written order automatically, once through.', 'Live 让你自己选择何时换段，Song 自动按你写下的顺序播放一遍。'),
    steps: [
      { title: t('Write the order outside passages', '在段落外写顺序'), body: t('Add one song{ ... } block. Each line is a quoted passage name and a number of bars. "Verse" 4 means four bars, not four repetitions of its longest loop.', '添加一个 song{ ... } 块。每行是带引号的段落名和小节数。"Verse" 4 是四小节，不是该段最长循环的四次重复。') },
      { title: t('Choose Song, then Play', '选择 Song，再按 Play'), body: t('The complete order is checked before playback. Each section starts its passage at bar 1 and changes at a bar boundary. The final section ends playback. Each passage keeps its own tempo and meter.', '播放前会检查整个顺序。每段从自己的第一小节开始，在小节边界切换，最后一段结束后自动停止。各段使用自己的速度和拍号。') },
      { title: t('Edit the arrangement', '修改编排'), body: t('Song order controls add, move and remove sections by editing the same code. Re-evaluate in Song mode applies edits at the next bar, preserving elapsed song bars. Launching a passage manually returns to Live.', 'Song order 控件通过修改同一份代码来添加、移动和删除段落。Song 模式下 Re-evaluate 在下一小节应用修改，保留已播放的小节位置。手动启动段落会返回 Live。') },
    ],
    code: `${sections}\n\nsong{\n  "Verse" 4\n  "Chorus" 8\n  "Verse" 4\n}`,
    hear: t('Four bars of Verse, eight of Chorus, then four of Verse: sixteen bars total, followed by silence.', '四小节 Verse、八小节 Chorus，再四小节 Verse：共十六小节，随后停止。'),
    tryIt: t('Change Chorus from 8 bars to 4. While stopped, select Song and Play to hear the shorter arrangement from the beginning.', '把 Chorus 从 8 小节改为 4 小节。停止后选择 Song 并按 Play，从头听较短的编排。'),
    tip: t('Names must match exactly. Each section can last 1–256 bars; the song can have up to 128 sections and 4096 bars. Saved projects open stopped in Live mode; select Song again for the arrangement.', '名称必须准确匹配。每段可为 1–256 小节，整首最多 128 段、4096 小节。工程打开后是停止的 Live 模式，要播放编排需重新选择 Song。'),
  },
  {
    id: 'save', title: t('Save & return later', '保存与继续创作'),
    intro: t('Your draft stays in this browser. Export a project for a backup or to move it elsewhere.', '草稿保存在当前浏览器中。需要备份或换设备时，请导出工程。'),
    steps: [
      { title: t('Name your song', '给歌曲命名'), body: t('Change the SONG field in Studio. The name, code and editing passage auto-save after a short pause, even when unfinished. Check the saved status; a storage warning means you should export.', '在 Studio 的 SONG 栏修改名称。暂停输入片刻后，名称、代码和编辑段落会自动保存，未完成的代码也会保存。注意保存状态；出现存储警告时应导出。') },
      { title: t('Download a portable backup', '下载可携带的备份'), body: t('Choose Export .ohcodes or Cmd/Ctrl+S. The file contains the source project, including all passages and the Song order. It is not an audio file. Use Open to load it; old .ohsounds projects also open.', '点击 Export .ohcodes 或 Cmd/Ctrl+S。文件包含全部段落和 Song 顺序等源代码工程，不是音频。用 Open 打开，也兼容旧的 .ohsounds 工程。') },
      { title: t('Replace a project deliberately', '替换工程前确认'), body: t('New song and Open may ask whether to export your work first. Previous draft holds only the last replaced project, not every version. Opening or restoring a project never auto-plays.', 'New song 和 Open 可能询问是否先导出作品。Previous draft 只保留上一次被替换的工程，不是所有历史版本。打开或恢复工程不会自动播放。') },
    ],
    tryIt: t('Export a named .ohcodes file, then Open it. Check its notes, passages and order before starting a new song.', '导出一个有名称的 .ohcodes 文件，再用 Open 打开。确认音符、段落和顺序都还在，再开始新歌。'),
    tip: t('Browser saving is not cloud sync. Another browser, device or site address has a separate draft. Clearing browser data can remove it. Audio export, recording and sample import are not connected yet.', '浏览器保存不是云同步。其他浏览器、设备或网址有独立草稿；清除浏览器数据可能删除它。当前还没有音频导出、录音和采样导入。'),
  },
  {
    id: 'reference', title: t('Help & quick reference', '排错与速查'),
    intro: t('If something sounds wrong, check the musical structure before changing more settings.', '如果声音和预期不同，先检查音乐结构，再继续改设置。'),
    steps: [
      { title: t('No sound?', '没有声音？'), body: t('Empty [] rows are silent. Add 1 for a drum or C3 for a melodic instrument. Press Play; Re-evaluate while stopped only prepares the music. Check your device volume, output and instrument .volume().', '空 [] 行是静音。鼓需要填 1，旋律需要填 C3 等音高。按 Play 开始；停止时 Re-evaluate 只是准备音乐。同时检查设备音量、输出和乐器的 .volume()。') },
      { title: t('The old rhythm is still playing?', '还在播放旧节奏？'), body: t('Typed edits are drafts until Re-evaluate. Changes wait for the next bar; invalid code retains the last valid music. Check which passage says EDITING and which says PLAYING.', '文字修改在 Re-evaluate 之前只是草稿。修改需要等待下一小节，无效代码保留上一版有效音乐。检查哪个段落标记 EDITING，哪个标记 PLAYING。') },
      { title: t('A red underline?', '出现红色波浪线？'), body: t('Click the error or marked line number to select the problem. Match [], () and {}. Drums need one bracket per beat; melodic groups divide the bar. Keep parameters in their displayed ranges.', '点击错误或标记行号，选中问题位置。检查 []、()、{} 是否成对。鼓每拍需要一个括号，旋律括号平均分配整小节。参数要在提示范围内。') },
      { title: t('No suggestions?', '没有出现提示？'), body: t('Type an instrument name on a blank line inside a passage. For sounds/effects, type inside .timbre() or .effects(). Empty parentheses show no list. Escape dismisses it; editing the query brings it back.', '在段落内的空行输入乐器名。音色／效果在 .timbre() 或 .effects() 内输入名称。空括号不显示列表。Escape 关闭提示，继续修改搜索词可重新显示。') },
    ],
    tryIt: t('In Studio, try .velocity(140), find the error, then change it to .velocity(90). Re-evaluate to apply the valid version.', '在 Studio 试写 .velocity(140)，找到错误，再改为 .velocity(90)。重新运行以应用有效版本。'),
    tip: t('In Studio: Cmd/Ctrl+Enter re-evaluates; Cmd/Ctrl+Shift+1–9 launches passages; Cmd/Ctrl+S exports. In suggestions: ↑/↓ chooses, Tab/Enter inserts, Esc dismisses. The square Stop button stops and resets.', 'Studio 中：Cmd/Ctrl+Enter 重新运行；Cmd/Ctrl+Shift+1–9 启动段落；Cmd/Ctrl+S 导出。提示列表中：↑/↓ 选择，Tab/Enter 插入，Esc 关闭。方形 Stop 按钮停止并重置。'),
  },
];
