/* PORTAL REQUISICIÓN DE PERSONAL — JS */

const { createApp } = Vue;

createApp({
  data() {
    return {
      cargando      : true,
      sesion        : null,
      tab           : "nueva",
      requisiciones : [],
      cargandoReq   : false,
      enviando      : false,
      errGlobal     : "",
      okMensaje     : "",
      errores       : {},
      form: {
        cargo_requerido  : "",
        area             : "",
        cantidad         : 1,
        tipo_contrato    : "",
        salario_propuesto: "",
        justificacion    : "",
        perfil_requerido : "",
        fecha_requerida  : "",
      },
    };
  },

  computed: {
    iniciales() {
      if (!this.sesion?.nombre) return "?";
      return this.sesion.nombre.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
    },
    pendientes() {
      return this.requisiciones.filter(r => r.estado === "pendiente" || r.estado === "en_proceso").length;
    },
  },

  async mounted() {
    await this.cargarSesion();
  },

  methods: {
    async cargarSesion() {
      try {
        const res  = await fetch("/api/portal/sesion", { credentials: "same-origin" });
        if (!res.ok) { window.location.href = "/login.html"; return; }
        this.sesion  = await res.json();
        this.cargando = false;
      } catch {
        window.location.href = "/login.html";
      }
    },

    async cargarRequisiciones() {
      if (this.cargandoReq) return;
      this.cargandoReq = true;
      try {
        const res  = await fetch("/api/portal/mis-requisiciones", { credentials: "same-origin" });
        const data = await res.json();
        this.requisiciones = Array.isArray(data) ? data : [];
      } catch {
        this.requisiciones = [];
      } finally {
        this.cargandoReq = false;
      }
    },

    validar() {
      const e = {};
      if (!this.form.cargo_requerido.trim())
        e.cargo_requerido = "El cargo es obligatorio.";
      if (this.form.justificacion.trim().length < 10)
        e.justificacion = "La justificación es obligatoria (mínimo 10 caracteres).";
      this.errores = e;
      return Object.keys(e).length === 0;
    },

    async enviarRequisicion() {
      this.errGlobal = "";
      this.okMensaje = "";
      if (!this.validar()) return;

      this.enviando = true;
      try {
        const res  = await fetch("/api/portal/requisicion", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify(this.form),
          credentials: "same-origin",
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          this.errGlobal = data.error || "No se pudo enviar la requisición.";
        } else {
          this.okMensaje = "✅ Requisición enviada correctamente. El área de RRHH recibirá la notificación.";
          this.resetForm();
        }
      } catch {
        this.errGlobal = "Error de conexión. Intenta de nuevo.";
      } finally {
        this.enviando = false;
      }
    },

    resetForm() {
      this.form = {
        cargo_requerido: "", area: "", cantidad: 1,
        tipo_contrato: "", salario_propuesto: "",
        justificacion: "", perfil_requerido: "", fecha_requerida: "",
      };
      this.errores = {};
    },

    async cerrarSesion() {
      const { isConfirmed } = await Swal.fire({
        title: "¿Cerrar sesión?",
        icon : "question",
        showCancelButton  : true,
        confirmButtonColor: "#1e3a8a",
        cancelButtonColor : "#6c757d",
        confirmButtonText : "Sí, salir",
        cancelButtonText  : "Cancelar",
        customClass       : { popup: "swal-custom-popup" },
      });
      if (isConfirmed) window.location.href = "/login.html";
    },

    estadoLabel(estado) {
      return { pendiente: "Pendiente", en_proceso: "En proceso", aprobada: "Aprobada", rechazada: "Rechazada" }[estado] || estado;
    },

    formatFecha(f) {
      if (!f) return "";
      return new Date(f).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
    },
  },
}).mount("#app");
