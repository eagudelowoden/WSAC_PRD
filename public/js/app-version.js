/**
 * app-version.js
 * Reemplaza todos los elementos con [data-app-version] con la versión
 * real del backend. Incluir con <script src="/js/app-version.js"></script>
 */
(async () => {
  try {
    const res  = await fetch("/api/check-version", { cache: "no-store" });
    const data = await res.json();
    const ver  = data.appVersion || "—";

    document.querySelectorAll("[data-app-version]").forEach((el) => {
      el.textContent = el.dataset.appVersion
        ? el.dataset.appVersion.replace("{v}", ver) // plantilla personalizada
        : ver;
    });
  } catch {
    // Si falla, deja el texto que ya tenía el elemento
  }
})();
