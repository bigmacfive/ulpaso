import { IconArrowLeft, IconArrowUpRight, IconBrandGithub } from "@tabler/icons-react";
import { SiteFooter } from "./SiteFooter.jsx";
import { Seo } from "./Seo.jsx";
import { useI18n } from "./I18n.jsx";

const GITHUB_URL = "https://github.com/bigmacfive/ulpaso";

function LinkedText({ children }) {
  const parts = String(children).split("support@askitmore.com");
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>
      {index > 0 && <a href="mailto:support@askitmore.com">support@askitmore.com</a>}
      {part}
    </span>
  ));
}

function LegalHeader() {
  const { t } = useI18n();
  return (
    <header className="legal-header">
      <a className="brand" href="/" aria-label="Ulpaso">
        <img src="/assets/logo.svg" alt="" />
        <span>Ulpaso</span>
      </a>
      <a className="legal-back" href="/"><IconArrowLeft size={16} /> {t("legal.back")}</a>
    </header>
  );
}

function LegalNav({ active }) {
  const { t } = useI18n();
  const labels = t("legal.nav");
  return (
    <nav className="legal-nav" aria-label={t("legal.navAria")}>
      <a className={active === "legal" ? "is-active" : ""} href="/legal">{labels[0]}</a>
      <a className={active === "privacy" ? "is-active" : ""} href="/privacy">{labels[1]}</a>
      <a className={active === "terms" ? "is-active" : ""} href="/terms">{labels[2]}</a>
    </nav>
  );
}

function LegalOverview() {
  const { t } = useI18n();
  const copy = t("legal.overview");
  const cardUrls = ["/privacy", "/terms", `${GITHUB_URL}/blob/main/LICENSE`, `${GITHUB_URL}/blob/main/THIRD_PARTY_NOTICES.md`];
  return (
    <>
      <section>
        <h2>{copy.operatorTitle}</h2>
        <div className="legal-facts">
          {copy.facts.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              {value === "support@askitmore.com" ? <a href={`mailto:${value}`}>{value}</a> : <strong>{value}</strong>}
            </div>
          ))}
        </div>
        <p>{copy.operatorBody}</p>
      </section>
      <section>
        <h2>{copy.docsTitle}</h2>
        <div className="legal-cards">
          {copy.cards.map(([number, title, body], index) => {
            const external = index > 1;
            return <a href={cardUrls[index]} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} key={number}><span>{number}</span><strong>{title}</strong><p>{body}</p></a>;
          })}
        </div>
      </section>
      <section>
        <h2>{copy.openTitle}</h2>
        <p>{copy.openBody}</p>
        <a className="legal-inline-link" href={GITHUB_URL} target="_blank" rel="noreferrer"><IconBrandGithub size={17} /> {copy.repo} <IconArrowUpRight size={14} /></a>
      </section>
      <section>
        <h2>{copy.fontTitle}</h2>
        <p>{copy.fontBody}</p>
        <a className="legal-inline-link" href="https://noonnu.cc/font_page/368" target="_blank" rel="noreferrer">{copy.fontLink} <IconArrowUpRight size={14} /></a>
      </section>
    </>
  );
}

function PolicySections({ sections }) {
  return sections.map((section) => (
    <section className={section.highlight ? "legal-highlight" : undefined} key={section.title}>
      {section.highlight && <p className="handwriting">{section.highlight}</p>}
      <h2>{section.title}</h2>
      {section.paragraphs?.map((paragraph) => <p key={paragraph}><LinkedText>{paragraph}</LinkedText></p>)}
      {section.bullets && <ul>{section.bullets.map(([label, body]) => <li key={label}><strong>{label}:</strong> {body}</li>)}</ul>}
    </section>
  ));
}

export function LegalPage({ type }) {
  const { locale, t } = useI18n();
  const normalizedType = type === "privacy" || type === "terms" ? type : "legal";
  const meta = t(`legal.pages.${normalizedType}`);
  const path = `/${normalizedType}`;

  return (
    <div className="legal-shell">
      <Seo path={path} locale={locale} />
      <LegalHeader />
      <main className="legal-layout">
        <div className="legal-hero">
          <div>
            <p className="eyebrow">{meta[0]}</p>
            <h1>{meta[1]}</h1>
            <p>{meta[2]}</p>
          </div>
        </div>
        <div className="legal-body">
          <aside>
            <LegalNav active={normalizedType} />
            <p>{t("legal.updated")}<br /><strong>{t("legal.updatedDate")}</strong></p>
          </aside>
          <article className="legal-document">
            {normalizedType === "privacy" ? <PolicySections sections={t("legal.privacySections")} /> : normalizedType === "terms" ? <PolicySections sections={t("legal.termsSections")} /> : <LegalOverview />}
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
