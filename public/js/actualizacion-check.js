(function () {
    // 1. SEGURO ANTI-BUCLE: Si acaba de recargar, no hacer nada.
    const ultimaRecarga = sessionStorage.getItem('wsac_last_reload');
    if (ultimaRecarga && Date.now() - ultimaRecarga < 5000) {
        console.log("⏳ Calma... acabamos de recargar. Esperando sincronización.");
        return;
    }

    // --- VARIABLES DE ESTADO ---
    let versionAceptada = localStorage.getItem('wsac_version_actual');
    let bloqueado = false;
    const INTERVALO_VERSION = 7000; // 7 Segundos

    // 2. INICIALIZAR SOCKET (Para Mantenimiento y Conexión inicial)
    const socket = io();

    socket.on("connect", () => {
        console.log("🟢 Conectado al canal de eventos en tiempo real.");
    });

    socket.on("mantenimiento", (data) => {
        console.log("🚧 Actualización de mantenimiento recibida vía Socket.");
        actualizarBannerVue(data);
    });

    // 3. FUNCIÓN DE CHEQUEO POR HTTP (La que pediste)
    async function chequearVersionHTTP() {
        if (bloqueado) return;

        try {
            // Agregamos timestamp para evitar caché del navegador
            const res = await fetch(`/api/check-version?t=${Date.now()}`);
            const data = await res.json();
            const versionServidor = data.version;

            // Si no tenemos versión guardada, la registramos
            if (!versionAceptada) {
                versionAceptada = versionServidor;
                localStorage.setItem('wsac_version_actual', versionServidor);
                return;
            }

            // COMPARACIÓN: Si el server tiene algo distinto a lo que aceptamos
            if (versionServidor !== versionAceptada) {
                ejecutarActualizacion(versionServidor);
            }
        } catch (error) {
            console.warn("⚠️ No se pudo verificar la versión por API.");
        }
    }

    // 4. LÓGICA DE ALERTA Y RECARGA
    function ejecutarActualizacion(nuevaVersion) {
        bloqueado = true;
        
        Swal.fire({
            title: "¡ACTUALIZACIÓN DISPONIBLE!",
            text: "El sistema de WSAC se ha actualizado para mejorar tu experiencia.",
            icon: "info",
            confirmButtonText: "Sincronizar Ahora",
            confirmButtonColor: "rgb(116, 51, 221)",
            allowOutsideClick: false,
            backdrop: `rgba(30, 58, 138, 0.8)`
        }).then((result) => {
            if (result.isConfirmed) {
                // Guardamos la nueva versión como aceptada antes de recargar
                localStorage.setItem('wsac_version_actual', nuevaVersion);
                sessionStorage.setItem('wsac_last_reload', Date.now());

                // Recarga limpia
                window.location.href = "/?upd=" + Date.now();
            }
        });
    }

    function actualizarBannerVue(data) {
        if (!data) return;
        const v = window.app || window.vApp;
        if (v && v.avisoGlobal !== undefined) v.avisoGlobal = data;
    }

    // 5. INICIAR EL CRONÓMETRO (Polling)
    setInterval(chequearVersionHTTP, INTERVALO_VERSION);

    // Chequeo inicial inmediato al cargar
    chequearVersionHTTP();

})();