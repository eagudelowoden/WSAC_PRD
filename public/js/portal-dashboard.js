/* PORTAL COLABORADOR — Dashboard JS */

const { createApp } = Vue;

createApp({
  data() {
    return {
      cargando            : true,
      info                : null,
      tab                 : "info",
      solicitudes         : [],
      cargandoSolicitudes : false,
      enviandoSolicitud   : false,
      errDescripcion      : false,
      errSolicitud        : "",
      okSolicitud         : "",
      formSolicitud: {
        tipo       : "actualizacion_datos",
        descripcion: "",
      },
      tiposSolicitud: [
        { value: "actualizacion_datos",     label: "Actualizar datos",   icon: "bi bi-person-lines-fill" },
        { value: "solicitud_documento",     label: "Pedir documento",    icon: "bi bi-file-earmark-text-fill" },
        { value: "reporte_inconsistencia",  label: "Reportar error",     icon: "bi bi-exclamation-triangle-fill" },
        { value: "otro",                    label: "Otra solicitud",     icon: "bi bi-chat-dots-fill" },
      ],
      afiliaciones: [
        { key: "eps",  label: "EPS"  },
        { key: "arl",  label: "ARL"  },
        { key: "afp",  label: "AFP"  },
        { key: "ccf",  label: "CCF"  },
      ],
    };
  },

  computed: {
    iniciales() {
      if (!this.info) return "?";
      const n = (this.info.nombres  || "").charAt(0).toUpperCase();
      const a = (this.info.apellidos || "").charAt(0).toUpperCase();
      return n + a;
    },

    estadoTexto() {
      const mapa = { "0": "Sin proceso", "1": "En proceso", "2": "Completado", "3": "Aprobado" };
      return mapa[String(this.info?.aprobacion)] || "En proceso";
    },

    estadoIcono() {
      const mapa = {
        "0": "bi bi-hourglass",
        "1": "bi bi-arrow-repeat",
        "2": "bi bi-check-circle-fill",
        "3": "bi bi-patch-check-fill",
      };
      return mapa[String(this.info?.aprobacion)] || "bi bi-arrow-repeat";
    },

    estadoBadgeClass() {
      const mapa = {
        "0": "pd-status-default",
        "1": "pd-status-proceso",
        "2": "pd-status-aprobado",
        "3": "pd-status-aprobado",
      };
      return mapa[String(this.info?.aprobacion)] || "pd-status-proceso";
    },

    solicitudesPendientes() {
      return this.solicitudes.filter(s => s.estado === "pendiente" || s.estado === "en_revision").length;
    },
  },

  async mounted() {
    await this.cargarInfo();
  },

  methods: {
    async cargarInfo() {
      try {
        const res  = await fetch("/api/portal/mi-info", { credentials: "same-origin" });
        if (res.status === 401) { window.location.href = "/portal"; return; }
        const data = await res.json();
        if (data.error) { window.location.href = "/portal"; return; }
        this.info   = data;
        this.cargando = false;
      } catch {
        window.location.href = "/portal";
      }
    },

    async cargarSolicitudes() {
      if (this.cargandoSolicitudes) return;
      this.cargandoSolicitudes = true;
      try {
        const res  = await fetch("/api/portal/mis-solicitudes", { credentials: "same-origin" });
        const data = await res.json();
        this.solicitudes = Array.isArray(data) ? data : [];
      } catch {
        this.solicitudes = [];
      } finally {
        this.cargandoSolicitudes = false;
      }
    },

    async enviarSolicitud() {
      this.errSolicitud  = "";
      this.okSolicitud   = "";
      this.errDescripcion = false;

      if (!this.formSolicitud.tipo) {
        this.errSolicitud = "Selecciona un tipo de solicitud.";
        return;
      }

      if (this.formSolicitud.descripcion.trim().length < 10) {
        this.errSolicitud   = "La descripción es muy corta. Mínimo 10 caracteres.";
        this.errDescripcion = true;
        return;
      }

      this.enviandoSolicitud = true;

      try {
        const res = await fetch("/api/portal/solicitud", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({
            tipo       : this.formSolicitud.tipo,
            descripcion: this.formSolicitud.descripcion.trim(),
            csrf_token : this.info?.csrf_token,
          }),
          credentials: "same-origin",
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          this.errSolicitud = data.error || "No se pudo enviar la solicitud.";
        } else {
          this.okSolicitud           = "✅ Solicitud enviada correctamente. Te contactaremos pronto.";
          this.formSolicitud.descripcion = "";
          this.formSolicitud.tipo        = "actualizacion_datos";
          // Refrescar token CSRF
          await this.cargarInfo();
        }
      } catch {
        this.errSolicitud = "Error de conexión. Intenta de nuevo.";
      } finally {
        this.enviandoSolicitud = false;
      }
    },

    async cerrarSesion() {
      const { isConfirmed } = await Swal.fire({
        title  : "¿Cerrar sesión?",
        text   : "Deberás ingresar nuevamente con tu cédula y fecha de nacimiento.",
        icon   : "question",
        showCancelButton   : true,
        confirmButtonColor : "#1e3a8a",
        cancelButtonColor  : "#6c757d",
        confirmButtonText  : "Sí, salir",
        cancelButtonText   : "Cancelar",
        customClass        : { popup: "swal-custom-popup" },
      });

      if (!isConfirmed) return;

      await fetch("/api/portal/logout", { method: "POST", credentials: "same-origin" });
      window.location.href = "/portal";
    },

    tipoLabel(tipo) {
      const mapa = {
        actualizacion_datos   : "Actualización de datos",
        solicitud_documento   : "Solicitud de documento",
        reporte_inconsistencia: "Reporte de inconsistencia",
        otro                  : "Otra solicitud",
      };
      return mapa[tipo] || tipo;
    },

    estadoLabel(estado) {
      const mapa = {
        pendiente   : "Pendiente",
        en_revision : "En revisión",
        resuelta    : "Resuelta",
        rechazada   : "Rechazada",
      };
      return mapa[estado] || estado;
    },

    formatFecha(fecha) {
      if (!fecha) return "";
      return new Date(fecha).toLocaleDateString("es-CO", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    },
  },
}).mount("#app");
