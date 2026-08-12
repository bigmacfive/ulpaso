import { useEffect, useState } from "react";
import {
  IconCheck,
  IconArrowRight,
  IconArrowUpRight,
  IconCode,
  IconFileText,
  IconLock,
  IconMicrophone,
  IconCopy,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { LegalPage } from "./LegalPage.jsx";
import { SiteFooter } from "./SiteFooter.jsx";
import { ProductDemo } from "./ProductDemo.jsx";
import { Seo } from "./Seo.jsx";
import { useI18n } from "./I18n.jsx";

const DOWNLOAD_URL = "/download";
const GITHUB_URL = "https://github.com/bigmacfive/ulpaso";
const INSTALL_COMMAND = `git clone https://github.com/bigmacfive/ulpaso.git
cd ulpaso
corepack enable
pnpm install --frozen-lockfile
pnpm tauri:dev`;

function DownloadButton({ compact = false }) {
  const { t } = useI18n();
  return (
    <a className={`button button--primary ${compact ? "button--compact" : ""}`} href={DOWNLOAD_URL}>
      <span className="button-app-icon" aria-hidden="true">
        <img src="/assets/ulpaso-app-icon.png" alt="" />
      </span>
      <span>{t("download")}</span>
    </a>
  );
}

function GitHubLink({ children }) {
  const { t } = useI18n();
  return (
    <a className="text-link" href={GITHUB_URL} target="_blank" rel="noreferrer">
      <span>{children || t("github")}</span>
      <IconArrowUpRight size={15} stroke={1.6} aria-hidden="true" />
    </a>
  );
}

function SectionLabel({ number, children }) {
  return (
    <div className="document-label">
      <span>{number}</span>
      <p>{children}</p>
    </div>
  );
}

function LandingPage() {
  const [copied, setCopied] = useState(false);
  const { locale, t } = useI18n();

  useEffect(() => {
    const targets = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }),
      { threshold: 0.08, rootMargin: "0px 0px -7% 0px" },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = INSTALL_COMMAND;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="site-shell" id="top">
      <Seo path="/" locale={locale} />
      <main className="landing-document">
        <section className="document-hero page-frame" aria-labelledby="hero-title">
          <h1 className="hero-wordmark" id="hero-title">Ulpaso</h1>
          <div className="hero-intro" data-reveal>
            <p>{t("landing.heroLine1")}</p>
            <p>{t("landing.heroLine2")}</p>
          </div>
          <div className="hero-actions" data-reveal>
            <DownloadButton compact />
            <GitHubLink children={t("github")} />
          </div>
          <p className="requirements">{t("requirements")}</p>

          <div className="hero-product" data-reveal>
            <ProductDemo />
          </div>
        </section>

        <section className="document-section page-frame" id="how" data-reveal>
          <SectionLabel number="01">{t("landing.section1Label")}</SectionLabel>
          <div className="section-heading">
            <h2>{t("landing.section1Title")}</h2>
            <p>{t("landing.section1Body").split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p>
          </div>
          <div className="step-grid" aria-label={t("landing.stepsAria")}>
            {t("landing.steps").map(([title, body], index) => (
              <article key={title}>
                <span>{index + 1}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="document-section page-frame" id="features" data-reveal>
          <SectionLabel number="02">{t("landing.section2Label")}</SectionLabel>
          <div className="feature-ledger">
            {t("landing.features").map(([title, body], index) => {
              const FeatureIcon = [IconFileText, IconMicrophone, IconSettings][index];
              return <article key={title}><FeatureIcon size={25} stroke={1.45} aria-hidden="true" /><h3>{title}</h3><p>{body}</p></article>;
            })}
          </div>
        </section>

        <section className="document-section page-frame transcription-section" id="transcription" data-reveal>
          <SectionLabel number="03">{t("landing.section3Label")}</SectionLabel>
          <div className="waveform-wrap">
            <img src="/assets/ascii-waveform-wide-v2.png" alt={t("landing.waveformAlt")} />
          </div>
          <div className="transform-grid">
            <article className="transcript-panel">
              <header><strong>{t("landing.before")}</strong><span>{t("landing.beforeCaption")}</span></header>
              <div className="transcript-lines">
                {t("landing.beforeLines").map(([time, speaker, line]) => <p key={`${time}-${speaker}`}><time>{time}</time><span><b>{speaker}</b> {line}</span></p>)}
              </div>
            </article>
            <IconArrowRight className="transform-arrow" size={28} stroke={1.25} aria-hidden="true" />
            <article className="transcript-panel transcript-panel--after">
              <header><strong>{t("landing.after")}</strong><span>{t("landing.afterCaption")}</span></header>
              <div className="markdown-output">
                <h3>{t("landing.afterTitle")}</h3>
                <p>{t("landing.afterDecision")}</p>
                <ul>{t("landing.afterDecisionItems").map((item) => <li key={item}>{item}</li>)}</ul>
                <p>{t("landing.afterNext")}</p>
                <ul>{t("landing.afterNextItems").map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </article>
          </div>
        </section>

        <section className="document-section page-frame" id="open-source" data-reveal>
          <SectionLabel number="04">{t("landing.section4Label")}</SectionLabel>
          <div className="principle-row" aria-label={t("landing.principlesAria")}>
            {t("landing.principles").map(([title, body], index) => {
              const PrincipleIcon = [IconCode, IconUsers, IconLock][index];
              return <article key={title}><PrincipleIcon size={27} stroke={1.4} /><div><h3>{title}</h3><p>{body}</p></div></article>;
            })}
          </div>
        </section>

        <section className="document-section page-frame install-section" data-reveal>
          <SectionLabel number="05">{t("landing.section5Label")}</SectionLabel>
          <div className="install-layout">
            <div className="install-copy">
              <h2>{t("landing.section5Title")}</h2>
              <p>{t("landing.section5Body").split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p>
              <p className="requirements">{t("requirements")}</p>
              <GitHubLink children={t("landing.githubRepository")} />
            </div>
            <div className="terminal-panel" aria-label={t("landing.terminalAria")}>
              <header>
                <span>{t("landing.terminalTitle")}</span>
                <button className={`copy-command ${copied ? "is-copied" : ""}`} type="button" onClick={copyInstallCommand} aria-live="polite">
                  {copied ? <IconCheck size={15} stroke={1.8} /> : <IconCopy size={15} stroke={1.8} />}
                  {copied ? t("landing.copied") : t("landing.copy")}
                </button>
              </header>
              <pre><code>{INSTALL_COMMAND}</code></pre>
            </div>
          </div>
        </section>

        <section className="document-section page-frame final-section" id="download" data-reveal>
          <SectionLabel number="06">{t("landing.section6Label")}</SectionLabel>
          <h2>{t("landing.section6Title")}</h2>
          <div className="final-actions">
            <DownloadButton compact />
            <GitHubLink children={t("github")} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/privacy") return <LegalPage type="privacy" />;
  if (path === "/terms") return <LegalPage type="terms" />;
  if (path === "/legal") return <LegalPage type="legal" />;
  return <LandingPage />;
}
