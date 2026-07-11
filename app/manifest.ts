import { MetadataRoute } from 'next';
import { FALLBACK_SETTINGS, getEnvSettings } from '@/lib/branding/constants';

export default function manifest(): MetadataRoute.Manifest {
  const settings = { ...FALLBACK_SETTINGS, ...getEnvSettings() };

  return {
    name: `${settings.orgName} — Timeline`,
    short_name: 'Timeline',
    description: 'Gestion simple des missions de bénévoles',
    start_url: '/',
    display: 'standalone',
    background_color: '#F2F5FA',
    theme_color: settings.brandColor,
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
