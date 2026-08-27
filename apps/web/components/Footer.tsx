export function Footer() {
  return (
    <footer className="w-full py-8 px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-center mt-auto bg-surface-container-lowest border-t border-outline-variant/10">
      <div className="font-mono text-xs text-on-surface-variant mb-4 md:mb-0 tracking-widest">
        PROMISE WAR PROTOCOL © {new Date().getFullYear()} — ENCRYPTED ADJUDICATION
      </div>
      <div className="flex gap-6 font-mono text-xs text-on-surface-variant">
        <a href="/laws" className="hover:text-primary transition-colors">Terms of Combat</a>
        <a href="/privacy" className="hover:text-primary transition-colors">Privacy Hash</a>
        <a href="/laws" className="hover:text-primary transition-colors">Whitepaper</a>
      </div>
    </footer>
  );
}
