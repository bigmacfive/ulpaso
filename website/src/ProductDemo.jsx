import { useEffect, useMemo, useState } from "react";
import {
  IconCheckbox,
  IconCircleFilled,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconLayoutSidebarLeftCollapse,
  IconList,
  IconListNumbers,
  IconMicrophone,
  IconPhoto,
  IconPlayerStop,
  IconQuote,
  IconSeparatorHorizontal,
  IconSettings,
  IconTable,
} from "@tabler/icons-react";
import { useI18n } from "./I18n.jsx";
import "./ProductDemo.css";

const COMMAND_LINES = [
  "git clone https://github.com/bigmacfive/ulpaso.git",
  "cd ulpaso",
  "corepack enable",
  "pnpm install --frozen-lockfile",
  "pnpm tauri:dev",
];

const MEETING_HOLD_STEPS = 4;
const COMMAND_MENU_START = 2;
const COMMAND_MENU_END = 14;
const CODE_START = 15;

const SLASH_ITEMS = [
  { hint: "/meeting", icon: IconMicrophone },
  { hint: "#", icon: IconH1 },
  { hint: "##", icon: IconH2 },
  { hint: "###", icon: IconH3 },
  { hint: ">", icon: IconQuote },
  { hint: "```", icon: IconCode },
  { hint: "---", icon: IconSeparatorHorizontal },
  { hint: "/i", icon: IconPhoto },
  { hint: "/t", icon: IconTable },
  { hint: "-", icon: IconList },
  { hint: "1.", icon: IconListNumbers },
  { hint: "[]", icon: IconCheckbox },
];

function segmentTranscript(text, locale) {
  if (locale !== "ja" || typeof Intl.Segmenter !== "function") return text.split(/\s+/);
  const words = [];
  for (const segment of new Intl.Segmenter("ja", { granularity: "word" }).segment(text)) {
    if (segment.isWordLike || words.length === 0) words.push(segment.segment);
    else words[words.length - 1] += segment.segment;
  }
  return words.filter(Boolean);
}

export function ProductDemo() {
  const [step, setStep] = useState(0);
  const { locale, t } = useI18n();
  const meetingLines = useMemo(() => t("demo.meetingLines").map(([speaker, text]) => ({ speaker, text })), [locale, t]);
  const meetingWords = useMemo(() => meetingLines.map((line) => segmentTranscript(line.text, locale)), [locale, meetingLines]);
  const meetingWordCount = useMemo(() => meetingWords.reduce((sum, words) => sum + words.length, 0), [meetingWords]);
  const commandStartStep = meetingWordCount + MEETING_HOLD_STEPS;
  const loopLastStep = commandStartStep + 28;
  const slashTitles = t("demo.slashItems");

  useEffect(() => {
    setStep(0);
    const timer = window.setInterval(() => {
      setStep((value) => (value >= loopLastStep ? 0 : value + 1));
    }, 520);
    return () => window.clearInterval(timer);
  }, [locale, loopLastStep]);

  const meetingActive = step < commandStartStep;
  const commandStep = Math.max(0, step - commandStartStep);
  const commandMenuVisible = !meetingActive && commandStep >= COMMAND_MENU_START && commandStep <= COMMAND_MENU_END;
  const selectedCommand = commandMenuVisible
    ? Math.min(5, Math.floor((commandStep - COMMAND_MENU_START) / 2))
    : -1;
  const codeLineCount = commandStep >= CODE_START
    ? Math.min(COMMAND_LINES.length, Math.floor((commandStep - CODE_START) / 2) + 1)
    : 0;
  const documentTitle = meetingActive ? t("demo.meetingTitle") : t("demo.untitled");
  const meetingTime = useMemo(() => {
    const seconds = Math.min(59, Math.floor(step * .52));
    return `0:${String(seconds).padStart(2, "0")}`;
  }, [step]);

  return (
    <div className="product-demo" aria-label={t("demo.aria")}>
      <header className="actual-titlebar">
        <div className="actual-traffic-lights" aria-hidden="true">
          <IconCircleFilled size={9} />
          <IconCircleFilled size={9} />
          <IconCircleFilled size={9} />
        </div>
        <div className="actual-document-title">{documentTitle}</div>
        <div className="actual-title-actions">
          {meetingActive && (
            <div className="actual-meeting-pill" role="status" aria-live="polite">
              <span className="actual-meeting-dot" aria-hidden="true" />
              <span>{t("demo.transcribing")} {meetingTime}</span>
              <IconPlayerStop size={11} stroke={1.6} aria-hidden="true" />
            </div>
          )}
          <button type="button" tabIndex={-1} aria-label={t("demo.sidebar")}><IconLayoutSidebarLeftCollapse size={15} stroke={1.45} /></button>
          <button type="button" tabIndex={-1} aria-label={t("demo.settings")}><IconSettings size={15} stroke={1.45} /></button>
          <button className={meetingActive ? "is-active" : ""} type="button" tabIndex={-1} aria-label={t("demo.meeting")}><IconMicrophone size={15} stroke={1.45} /></button>
        </div>
      </header>

      <main className="actual-editor-pane">
        <article className="actual-editor" aria-live="polite">
          {meetingActive ? (
            <>
              <h2>{t("demo.meetingTitle")}</h2>
              {meetingLines.map((line, lineIndex) => {
                const previousWords = meetingWords.slice(0, lineIndex).reduce((sum, words) => sum + words.length, 0);
                const visibleWordCount = Math.min(meetingWords[lineIndex].length, Math.max(0, step - previousWords));
                if (!visibleWordCount) return null;
                return (
                  <div className="actual-transcript-segment" key={`${line.speaker}-${lineIndex}`}>
                    <p><strong>{t("demo.speaker")} {line.speaker}</strong></p>
                    <p>
                      {meetingWords[lineIndex].slice(0, visibleWordCount).map((word, wordIndex) => {
                        const isLatest = previousWords + wordIndex + 1 === step;
                        return <span className={`actual-word ${isLatest ? "is-latest" : ""}`} key={`${lineIndex}-${wordIndex}`}>{word}{locale !== "ja" && wordIndex < visibleWordCount - 1 ? " " : ""}</span>;
                      })}
                    </p>
                  </div>
                );
              })}
              {step < meetingWordCount && <p className="actual-listening">{t("demo.listening")}</p>}
              {step >= meetingWordCount && <p className="actual-listening">{t("demo.organizing")}</p>}
            </>
          ) : (
            <>
              {codeLineCount === 0 && (
                <p className="actual-slash-line">/<span className="actual-caret" aria-hidden="true" /></p>
              )}
              {commandMenuVisible && (
                <div className="actual-slash-menu" aria-label={t("demo.slashAria")}>
                  <div className="actual-slash-list">
                    {SLASH_ITEMS.map((item, index) => {
                      const ItemIcon = item.icon;
                      const title = slashTitles[index];
                      return (
                        <div className={`actual-slash-item ${selectedCommand === index ? "is-selected" : ""}`} key={title}>
                          <span className="actual-slash-icon"><ItemIcon size={15} stroke={1.5} /></span>
                          <span>{title}</span>
                          <small>{item.hint}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {codeLineCount > 0 && (
                <pre className="actual-code-block" data-language="shell"><code>{COMMAND_LINES.slice(0, codeLineCount).join("\n")}</code></pre>
              )}
            </>
          )}
        </article>
      </main>
    </div>
  );
}
