import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import Heading from "@theme/Heading";
import styles from "./index.module.css";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started"
          >
            Get Started →
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: "🚀 High Performance",
    description:
      "Handles 10K+ writes/sec and sub-100ms query latency with optimized columnar storage and adaptive compression (Gorilla, Delta, Dictionary).",
  },
  {
    title: "📊 Multi-Level Aggregation",
    description:
      "Pre-computed 1h/1d/1mo/1y aggregates for lightning-fast analytics queries across any time range.",
  },
  {
    title: "🔄 Horizontally Scalable",
    description:
      "Add storage nodes to scale linearly with device-based sharding via coordinator and consistent hashing.",
  },
];

function Feature({ title, description }) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Documentation`}
      description="Documentation for Soltix - High-Performance Distributed Time-Series Database"
    >
      <HomepageHeader />
      <main>
        <section className={styles.features}>
          <div className="container">
            <div className="row">
              {features.map((props, idx) => (
                <Feature key={idx} {...props} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
