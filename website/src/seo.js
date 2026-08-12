export const SITE_ORIGIN = "https://ulpaso.app";
export const OG_IMAGE_URL = `${SITE_ORIGIN}/og.png`;

export const SEO_BY_PATH = {
  "/": {
    title: "Ulpaso — Private, on-device meeting notes in Markdown",
    description: "Ulpaso is a free, open-source Mac app that transcribes meetings on-device and saves them as local Markdown files. No account or subscription required.",
  },
  "/legal": {
    title: "Operator and legal information — Ulpaso",
    description: "Learn who operates Ulpaso, how its open-source license applies, and where to find the service's legal documents and contact details.",
  },
  "/privacy": {
    title: "Privacy policy — Ulpaso",
    description: "Learn how Ulpaso handles local documents, meeting audio, on-device transcription, website access data, and privacy requests.",
  },
  "/terms": {
    title: "Terms of use — Ulpaso",
    description: "Read the terms for using Ulpaso, including its open-source license, meeting-recording responsibilities, file management, and limitations of liability.",
  },
};

const LOCALIZED_SEO = {
  ko: {
    "/": ["Ulpaso — 무료 온디바이스 회의 전사·Markdown 노트", "Ulpaso는 회의를 Mac 안에서 전사하고 평범한 Markdown 파일로 남기는 무료 오픈소스 앱입니다. 계정도 결제도 필요 없습니다."],
    "/legal": ["운영 및 법률 안내 — Ulpaso", "Ulpaso의 운영 주체 askitmore co., ltd, 오픈소스 라이선스, 법률 문서와 문의 방법을 안내합니다."],
    "/privacy": ["개인정보 처리방침 — Ulpaso", "Ulpaso의 로컬 문서, 회의 오디오, 온디바이스 전사와 웹사이트 접속 정보가 어떻게 처리되는지 설명합니다."],
    "/terms": ["이용약관 — Ulpaso", "Ulpaso 소프트웨어와 소개 웹사이트의 이용 조건, 오픈소스 라이선스, 회의 녹음 책임과 면책 범위를 안내합니다."],
  },
  ja: {
    "/": ["Ulpaso — プライベートなオンデバイス会議メモ", "Ulpasoは会議をMac上で文字起こしし、ローカルのMarkdownファイルとして保存する無料のオープンソースアプリです。アカウントもサブスクリプションも不要です。"],
    "/legal": ["運営・法務情報 — Ulpaso", "Ulpasoの運営者、オープンソースライセンス、法務文書、お問い合わせ方法をご案内します。"],
    "/privacy": ["プライバシーポリシー — Ulpaso", "Ulpasoがローカル文書、会議音声、オンデバイス文字起こし、ウェブサイトのアクセス情報をどのように扱うか説明します。"],
    "/terms": ["利用規約 — Ulpaso", "Ulpasoの利用条件、オープンソースライセンス、会議録音の責任、ファイル管理、責任制限をご案内します。"],
  },
};

export function normalizeSeoPath(pathname = "/") {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  return SEO_BY_PATH[cleanPath] ? cleanPath : "/";
}

export function getSeo(pathname = "/", locale = "en") {
  const path = normalizeSeoPath(pathname);
  const localized = LOCALIZED_SEO[locale]?.[path];
  return {
    ...SEO_BY_PATH[path],
    ...(localized ? { title: localized[0], description: localized[1] } : {}),
    path,
    canonical: `${SITE_ORIGIN}${path === "/" ? "/" : path}`,
    image: OG_IMAGE_URL,
    imageAlt: locale === "ko"
      ? "Ulpaso — 계정이나 구독 없이 회의를 비공개 로컬 Markdown으로 기록하는 앱"
      : locale === "ja"
        ? "Ulpaso — アカウントやサブスクリプションなしで会議をローカルMarkdownに記録"
        : "Ulpaso — capture meetings in private, local Markdown with no account or subscription",
  };
}

export function getStructuredData(pathname = "/", locale = "en") {
  const seo = getSeo(pathname, locale);
  const language = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  const organizationId = `${SITE_ORIGIN}/#organization`;
  const websiteId = `${SITE_ORIGIN}/#website`;
  const graph = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "askitmore co., ltd",
      alternateName: "askitmore",
      url: "https://www.askitmore.com/",
      email: "support@askitmore.com",
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: `${SITE_ORIGIN}/`,
      name: "Ulpaso",
      inLanguage: language,
      publisher: { "@id": organizationId },
    },
    {
      "@type": "WebPage",
      "@id": `${seo.canonical}#webpage`,
      url: seo.canonical,
      name: seo.title,
      description: seo.description,
      inLanguage: language,
      isPartOf: { "@id": websiteId },
      about: { "@id": `${SITE_ORIGIN}/#software` },
    },
  ];

  if (seo.path === "/") {
    graph.push({
      "@type": "SoftwareApplication",
      "@id": `${SITE_ORIGIN}/#software`,
      name: "Ulpaso",
      url: `${SITE_ORIGIN}/`,
      description: seo.description,
      image: seo.image,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "macOS 15+ on Apple Silicon",
      softwareRequirements: "Apple Silicon Mac, macOS 15 or later",
      downloadUrl: `${SITE_ORIGIN}/download`,
      installUrl: `${SITE_ORIGIN}/download`,
      codeRepository: "https://github.com/bigmacfive/ulpaso",
      license: "https://github.com/bigmacfive/ulpaso/blob/main/LICENSE",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "KRW",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "On-device meeting transcription",
        "Local Markdown file storage",
        "No account or subscription required",
        "Free and open source",
      ],
      publisher: { "@id": organizationId },
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
