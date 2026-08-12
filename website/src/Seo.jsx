import { useEffect } from "react";
import { getSeo, getStructuredData } from "./seo.js";

function setMeta(selector, content) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute("content", content);
}

function setLink(selector, href) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute("href", href);
}

export function Seo({ path, locale = "en" }) {
  useEffect(() => {
    const seo = getSeo(path, locale);
    document.documentElement.lang = locale;
    document.title = seo.title;

    setMeta('meta[name="description"]', seo.description);
    setMeta('meta[property="og:title"]', seo.title);
    setMeta('meta[property="og:description"]', seo.description);
    setMeta('meta[property="og:url"]', seo.canonical);
    setMeta('meta[property="og:image"]', seo.image);
    setMeta('meta[property="og:image:secure_url"]', seo.image);
    setMeta('meta[property="og:image:alt"]', seo.imageAlt);
    setMeta('meta[name="twitter:title"]', seo.title);
    setMeta('meta[name="twitter:description"]', seo.description);
    setMeta('meta[name="twitter:image"]', seo.image);
    setMeta('meta[name="twitter:image:alt"]', seo.imageAlt);
    setLink('link[rel="canonical"]', seo.canonical);
    const structuredData = document.getElementById("seo-json-ld");
    if (structuredData) structuredData.textContent = JSON.stringify(getStructuredData(path, locale));
  }, [locale, path]);

  return null;
}
