import hmaLogo from '../assets/images/hma-logo.png'

const WHATSAPP_URL = 'https://wa.me/970597867820'

/** يفتح الرابط في المتصفح الخارجي عبر shell.openExternal (وليس داخل نافذة التطبيق). */
function openWhatsApp() {
  window.ipcRenderer
    ?.invoke('shell:openExternal', WHATSAPP_URL)
    .catch(() => window.open(WHATSAPP_URL, '_blank'))
}

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="app-footer">
      <img src={hmaLogo} alt="HMA" className="app-footer-logo" />
      <span className="app-footer-team">HMA</span>
      <span className="app-footer-copy">© {year}</span>
      <button
        type="button"
        className="app-footer-wa"
        onClick={openWhatsApp}
        title="تواصل عبر واتساب"
        aria-label="تواصل عبر واتساب"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.82c2.16 0 4.19.84 5.72 2.37a8.05 8.05 0 0 1 2.37 5.72c0 4.46-3.63 8.09-8.1 8.09a8.1 8.1 0 0 1-4.12-1.13l-.3-.18-3.06.8.82-2.99-.19-.31a8.05 8.05 0 0 1-1.24-4.28c0-4.46 3.63-8.09 8.1-8.09Zm-4.6 4.31c-.22 0-.57.08-.87.4-.3.32-1.14 1.11-1.14 2.71s1.17 3.15 1.33 3.37c.16.21 2.3 3.51 5.58 4.79.78.3 1.39.48 1.86.62.78.25 1.49.21 2.05.13.63-.09 1.93-.79 2.2-1.55.27-.76.27-1.41.19-1.55-.08-.13-.3-.21-.62-.37-.32-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.73.16-.21.32-.84 1.06-1.03 1.27-.19.21-.38.24-.7.08-.32-.16-1.37-.5-2.61-1.61-.96-.86-1.61-1.92-1.8-2.24-.19-.32-.02-.49.14-.65.14-.14.32-.38.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.76-1-2.42-.26-.63-.53-.54-.72-.55-.19-.01-.4-.01-.62-.01Z"
          />
        </svg>
      </button>
    </footer>
  )
}
