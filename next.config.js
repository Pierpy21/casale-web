/**
 * Host di PocketBase (file allegati: foto menù, ricevute acconti).
 * Da NEXT_PUBLIC_POCKETBASE_URL; in sviluppo è sempre consentito http://127.0.0.1:8090.
 * @returns {Array<Record<string, string>>}
 */
function pocketbaseImagePatterns() {
  const patterns = [];
  const raw = process.env.NEXT_PUBLIC_POCKETBASE_URL;

  if (raw) {
    try {
      const url = new URL(raw);
      patterns.push({
        protocol: url.protocol.replace(':', ''),
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: '/api/files/**',
      });
    } catch {
      // URL non valido: nessun pattern aggiuntivo, next/image mostrerà errore esplicito.
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    patterns.push({
      protocol: 'http',
      hostname: '127.0.0.1',
      port: '8090',
      pathname: '/api/files/**',
    });
  }

  return patterns;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pacchetti con binari/Node-only: non vanno bundlati nel server.
  serverExternalPackages: ['@react-pdf/renderer', 'web-push'],
  // pdfkit (usato da @react-pdf) carica i font standard (Helvetica…) con un percorso calcolato a runtime:
  // il tracciamento dei file non li vede e su Vercel mancano ("Cannot find module …/Helvetica.cjs").
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/pdfkit/js/standard-fonts/**/*', './node_modules/pdfkit/js/data/**/*'],
  },
  experimental: {
    serverActions: {
      // Ricevute degli acconti e foto menù: fino a 10 MB più il margine del form.
      bodySizeLimit: '52mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'prod-files-secure-euc1.s3.eu-central-1.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ibb.co', // Questo è il dominio dei link diretti di ImgBB
        pathname: '/**',
      },
      ...pocketbaseImagePatterns(),
    ],
  },
  async headers() {
    return [
      {
        // Service worker dell'agenda: scope /admin/ (vedi components/pwa/ServiceWorkerRegister.tsx).
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/admin/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
