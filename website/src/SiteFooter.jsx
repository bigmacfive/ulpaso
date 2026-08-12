import { useI18n } from "./I18n.jsx";

const GITHUB_URL = "https://github.com/bigmacfive/ulpaso";

export function SiteFooter() {
  const { locale, setLocale, t, labels, supported } = useI18n();

  return (
    <footer className="site-footer page-frame">
      <div className="footer-main">
        <nav aria-label={t("footer.navAria")}>
          <a href="/privacy">{t("footer.privacy")}</a>
          <a href="/terms">{t("footer.terms")}</a>
          <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">{t("footer.license")}</a>
        </nav>
        <span>{t("footer.operatedBy")}</span>
      </div>
      <div className="footer-language" role="group" aria-label={t("language")}>
        {supported.map((item) => (
          <button type="button" aria-pressed={locale === item} className={locale === item ? "is-active" : ""} onClick={() => setLocale(item)} key={item}>
            {labels[item]}
          </button>
        ))}
      </div>
    </footer>
  );
}
