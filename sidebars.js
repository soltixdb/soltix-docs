/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    "getting-started",
    "configuration",
    {
      type: "category",
      label: "Architecture",
      items: [
        "architecture/overview",
        "architecture/shard-management",
        "architecture/coordinator-optimization",
      ],
    },
    {
      type: "category",
      label: "Storage",
      items: [
        "storage/overview",
        "storage/wal",
        "storage/flush",
        "storage/file-format",
        "storage/compression",
        "storage/last-write-wins",
      ],
    },
    {
      type: "category",
      label: "Aggregation",
      items: [
        "aggregation/pipeline",
        "aggregation/downsampling",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      items: [
        "api/authentication",
        "api/write",
        "api/query",
        "api/streaming",
        "api/download",
      ],
    },
    {
      type: "category",
      label: "Advanced",
      items: [
        "advanced/anomaly-detection",
        "advanced/forecasting",
        "advanced/sync",
      ],
    },
    "benchmark",
    "roadmap",
  ],
};

export default sidebars;
