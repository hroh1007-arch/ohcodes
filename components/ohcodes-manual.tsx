'use client';

import { useMemo, useRef, useState } from 'react';
import { MANUAL_LESSONS, type ManualLanguage } from '@/lib/ohcodes-manual';
import { SOUNDBANKS } from '@/lib/ohcodes-soundbanks';
import { scanCode } from '@/lib/ohcodes-editor';
import styles from '@/app/ohcodes/ohcodes.module.css';

export function OhcodesManual({ onStudio }: { onStudio: () => void }) {
  const [language, setLanguage] = useState<ManualLanguage>('en');
  const [chapter, setChapter] = useState(0);
  const [query, setQuery] = useState('');
  const [copyResult, setCopyResult] = useState<{ id: string; ok: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const lesson = MANUAL_LESSONS[chapter];
  const tr = (en: string, zh: string) => language === 'en' ? en : zh;
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return MANUAL_LESSONS.map((item, index) => ({ item, index })).filter(({ item }) => JSON.stringify(item).toLowerCase().includes(search));
  }, [query]);
  const tokens = useMemo(() => scanCode(lesson.code ?? '').tokens, [lesson.code]);
  const chooseChapter = (index: number) => {
    setChapter(index); setCopyResult(null);
    requestAnimationFrame(() => { headingRef.current?.focus({ preventScroll: true }); headingRef.current?.scrollIntoView({ block: 'start' }); });
  };
  const copyExample = async () => {
    if (!lesson.code) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(lesson.code);
      setCopyResult({ id: lesson.id, ok: true });
    } catch {
      setCopyResult({ id: lesson.id, ok: false });
      if (codeRef.current) {
        const range = document.createRange(); range.selectNodeContents(codeRef.current);
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
        codeRef.current.parentElement?.focus();
      }
    } finally { setCopying(false); }
  };

  return <div className={styles.manual} lang={language === 'zh' ? 'zh-CN' : 'en'}>
    <header className={styles.manualHeader}>
      <div><span className={styles.manualEyebrow}>OHCODES MANUAL</span><h1>{tr('From silence to a song.', '从安静开始，写成一首歌。')}</h1><p>{tr('No coding experience needed. Read a little, write a little, then listen.', '不需要编程基础。读一点，写一点，然后听听变化。')}</p></div>
      <label className={styles.manualLanguage}>{tr('Manual language', '教程语言')}<select aria-label="Manual language" value={language} onChange={(event) => setLanguage(event.target.value as ManualLanguage)}><option value="en">English</option><option value="zh">中文</option></select></label>
    </header>
    <div className={styles.manualLayout}>
      <aside className={styles.manualContents}>
        <label htmlFor="manual-search">{tr('Find a lesson', '搜索教程')}</label>
        <div className={styles.manualSearch}><input id="manual-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Try chords, swing, save…', '试试和弦、swing、保存…')} />{query && <button onClick={() => setQuery('')} aria-label={tr('Clear lesson search', '清除搜索')}>×</button>}</div>
        <nav aria-label={tr('Manual chapters', '教程章节')}>
          {matches.map(({ item, index }) => <button key={item.id} aria-current={chapter === index ? 'step' : undefined} onClick={() => chooseChapter(index)}><span>{String(index).padStart(2, '0')}</span>{item.title[language]}</button>)}
        </nav>
        {!matches.length && <p role="status">{tr('No lessons found. Try a musical term or clear the search.', '没有找到章节。换一个音乐术语，或清除搜索。')}</p>}
        <p className={styles.manualKeepPlaying}>{tr('Read at your pace. Your Studio code and playback stay as they are.', '按自己的节奏学习。Studio 代码和播放状态会保持原样。')}</p>
        <button className={styles.manualStudio} onClick={onStudio}>{tr('Back to Studio →', '返回 Studio →')}</button>
      </aside>

      <article className={styles.manualLesson} aria-labelledby="manual-lesson-title">
        <div className={styles.manualLessonMeta}>{tr('LESSON', '第')} {String(chapter).padStart(2, '0')} {tr(`· ${MANUAL_LESSONS.length} LESSONS`, '课')}<span>{tr('READ → WRITE → LISTEN', '阅读 → 输入 → 聆听')}</span></div>
        <h2 ref={headingRef} id="manual-lesson-title" tabIndex={-1}>{lesson.title[language]}</h2>
        <p className={styles.manualIntro}>{lesson.intro[language]}</p>
        <ol className={styles.manualSteps}>{lesson.steps.map((step, index) => <li key={index}><span>{index + 1}</span><div><h3>{step.title[language]}</h3><p>{step.body[language]}</p></div></li>)}</ol>

        {lesson.code && <section className={styles.manualExample} aria-label={tr('Complete example project', '完整示例工程')}>
          <div className={styles.manualExampleHead}><span>{tr('COMPLETE EXAMPLE · .ohcodes', '完整示例 · .ohcodes')}</span><button disabled={copying} onClick={() => void copyExample()}>{copying ? tr('Copying…', '复制中…') : tr('Copy example', '复制示例')}</button></div>
          <pre tabIndex={0} aria-label={tr('Example code', '示例代码')}><code ref={codeRef}>{tokens.map((token) => <span key={token.from} className={styles[`syntax_${token.kind}`]}>{lesson.code!.slice(token.from, token.to)}</span>)}</code></pre>
          <p>{tr('This is a whole project. To try it: copy, return to Studio, export any work you want to keep, start New song, then replace the editor text. Choose Live and Play; the arrangement lesson uses Song.', '这是完整工程。尝试时：复制，返回 Studio，导出要保留的作品，点击 New song，再替换编辑区内容。选择 Live 并按 Play；编排课需要选择 Song。')}</p>
          {copyResult?.id === lesson.id && <p className={styles.manualCopyStatus} role="status">{copyResult.ok ? tr('Copied. Your Studio project has not changed.', '已复制。Studio 工程没有改变。') : tr('Clipboard unavailable. The example is selected: use Cmd/Ctrl+C, or select its text manually.', '无法自动访问剪贴板。示例已选中：请按 Cmd/Ctrl+C，或手动选择代码复制。')}</p>}
        </section>}

        {lesson.hear && <section className={styles.manualListen}><h3>{tr('What you should hear', '应该听到什么')}</h3><p>{lesson.hear[language]}</p></section>}
        <section className={styles.manualTry}><h3>{tr('Make it yours', '自己试一试')}</h3><p>{lesson.tryIt[language]}</p><button onClick={onStudio}>{tr('Try in Studio →', '回 Studio 试试 →')}</button></section>
        <aside className={styles.manualTip}><h3>{tr('Keep in mind', '记住这点')}</h3><p>{lesson.tip[language]}</p></aside>

        {(lesson.id === 'timbres' || lesson.id === 'reference') && <section className={styles.manualBanks}><h3>{tr('Built-in sound names', '内置音色名称')}</h3>{(['drum', 'pitched'] as const).map((kind) => <div key={kind}><h4>{kind === 'drum' ? tr('Drum kits', '鼓组') : tr('Melodic sounds', '旋律音色')}</h4><p>{SOUNDBANKS.filter((bank) => bank.kind === kind).map((bank) => <code key={bank.id}>{bank.id}</code>)}</p></div>)}</section>}
        {(lesson.id === 'mix' || lesson.id === 'reference') && <div className={styles.manualTableWrap}><table><caption>{tr('Effect parameter ranges', '效果参数范围')}</caption><thead><tr><th>{tr('Effect', '效果')}</th><th>{tr('Parameters, left to right', '参数，从左到右')}</th></tr></thead><tbody>
          <tr><th>reverb</th><td>{tr('Mix 0–100% · decay 0.1–8 seconds', '混合 0–100% · 衰减 0.1–8 秒')}</td></tr>
          <tr><th>delay</th><td>{tr('Mix 0–100% · "1/2", "1/4", "1/8", "1/16", "1/32" · feedback 0–80%. Add . for dotted or t for triplet to the note length.', '混合 0–100% · "1/2"、"1/4"、"1/8"、"1/16"、"1/32" · 反馈 0–80%。时长末尾加 . 表示附点，加 t 表示三连音。')}</td></tr>
          <tr><th>filter</th><td>{tr('Low-pass cutoff 20–20000 Hz', '低通截止频率 20–20000 Hz')}</td></tr>
        </tbody></table></div>}

        <nav className={styles.manualPager} aria-label={tr('Lesson navigation', '课程导航')}>
          <button disabled={chapter === 0} onClick={() => { setQuery(''); chooseChapter(chapter - 1); }}>← {tr('Previous', '上一课')}</button>
          {chapter < MANUAL_LESSONS.length - 1 ? <button onClick={() => { setQuery(''); chooseChapter(chapter + 1); }}>{tr('Next', '下一课')}: {MANUAL_LESSONS[chapter + 1].title[language]} →</button> : <button onClick={onStudio}>{tr('Make your own song →', '去写自己的歌 →')}</button>}
        </nav>
      </article>
    </div>
  </div>;
}
