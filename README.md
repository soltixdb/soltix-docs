# Soltix Documentation

Documentation website for [Soltix](https://github.com/soltixdb/soltix) - a high-performance distributed time-series database.

Built with [Docusaurus](https://docusaurus.io/).

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start
```

The site will be available at `http://localhost:3000/soltix-docs/`.

## Build

```bash
npm run build
```

## Deployment

### GitHub Pages

Push to `main` branch triggers automatic deployment via GitHub Actions.

**Setup:**
1. Go to repository Settings → Pages
2. Set Source to "GitHub Actions"

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/soltixdb/soltix-docs)

1. Import the repository on [Vercel](https://vercel.com)
2. Framework will be auto-detected as Docusaurus
3. Deploy!

## Project Structure

```
soltix-docs/
├── docs/                  # Documentation pages (Markdown)
│   ├── getting-started.md
│   ├── architecture/
│   ├── storage/
│   ├── aggregation/
│   ├── api/
│   └── advanced/
├── src/
│   ├── css/              # Custom styles
│   └── pages/            # Custom pages (React)
├── static/               # Static assets
├── docusaurus.config.js  # Docusaurus configuration
├── sidebars.js           # Sidebar navigation
└── package.json
```

## License

MIT
