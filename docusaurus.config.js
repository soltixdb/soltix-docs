// @ts-check
import { themes as prismThemes } from "prism-react-renderer";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Soltix",
  tagline: "High-Performance Distributed Time-Series Database",
  favicon: "img/favicon.ico",

  // Vercel: VERCEL=1 → baseUrl="/", GitHub Pages: baseUrl="/soltix-docs/"
  url: process.env.VERCEL ? "https://soltix-docs.vercel.app" : "https://guentoan.github.io",
  baseUrl: process.env.VERCEL ? "/" : "/soltix-docs/",

  organizationName: "guentoan",
  projectName: "soltix-docs",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: "./sidebars.js",
          editUrl: "https://github.com/soltixdb/soltix-docs/tree/main/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: "img/soltix-social-card.png",
      navbar: {
        title: "Soltix",
        logo: {
          alt: "Soltix - High-Performance Distributed Time-Series Database",
          src: "img/logo.png",
          href: "https://soltixdb.com",
          target: "_blank",
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "docsSidebar",
            position: "left",
            label: "Documentation",
          },
        ],
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ["bash", "go", "yaml", "protobuf"],
      },
    }),
};

export default config;
